#!/usr/bin/env python3
"""Wire the VM equivalent of upstream's Kind FRR and Uplink test networks.

Requires root on the libvirt host, PyYAML, and key-based SSH to the guests.
Only containers labelled by this helper may be replaced. Guest configuration
is boot-scoped; rerun after reboot. No production network is inferred.
"""

import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET


LABEL = "dpu-simulator.vm-routing"
ROUTER = "dpu-sim-vm-frr"
SERVER = "dpu-sim-vm-bgpserver"


def run(*args, stdin=None):
    return subprocess.check_output(args, input=stdin, text=True).strip()


def plan(cfg):
    if cfg.get("kind") or not cfg.get("vms") or not cfg["kubernetes"].get("offload_dpu"):
        raise ValueError("requires a VM offload deployment")
    networks = {n["type"]: n for n in cfg["networks"]}
    k8s, uplink, links = (networks[t] for t in ("k8s", "layer2", "HostToDpu"))
    if links.get("uplink_vfs_count", 0) < 1:
        raise ValueError("HostToDpu.uplink_vfs_count must be at least 1")
    if not uplink.get("use_ovs") or uplink.get("mode") != "l2-bridge":
        raise ValueError("layer2 must be an OVS l2-bridge network dedicated to this lab")
    subnet = ipaddress.ip_network(links.get("gateway_subnet", "172.30.0.0/24"))
    if subnet.version != 4:
        raise ValueError("gateway_subnet must be IPv4")
    upnet = ipaddress.ip_network(os.getenv("DPU_SIM_VM_UPLINK_SUBNET", "172.31.0.0/24"))
    external = ipaddress.ip_network(os.getenv("DPU_SIM_VM_EXTERNAL_SUBNET", "172.29.0.0/24"))
    # Fixed offsets below are intentionally bounded to /24 test networks.
    if upnet.version != 4 or external.version != 4 or upnet.prefixlen != 24 or external.prefixlen != 24:
        raise ValueError("VM Uplink and external test subnets must be IPv4 /24 networks")
    for n in networks.values():
        if n.get("gateway") and n.get("subnet_mask"):
            configured = ipaddress.ip_network(f'{n["gateway"]}/{n["subnet_mask"]}', strict=False)
            if configured.overlaps(subnet) or configured.overlaps(upnet) or configured.overlaps(external):
                raise ValueError("test subnet overlaps a configured VM network")
    if upnet.overlaps(external) or subnet.overlaps(upnet) or subnet.overlaps(external):
        raise ValueError("external and Uplink networks overlap")
    dpus = [v for v in cfg["vms"] if v.get("type") == "dpu" and v.get("host")]
    if not dpus or len(dpus) > 100:
        raise ValueError("requires 1–100 host/DPU pairs")
    if subnet.num_addresses - 2 < 2 + 2 * len(dpus):
        raise ValueError("gateway subnet lacks space for bridge, DPUs, host VFs and FRR")
    # Keep allocation identical to Config.VMGatewayIP: low-end DPUs, high-end VFs.
    gateway = subnet[2 + len(dpus)]
    return {
        "gateway_router": str(gateway), "gateway_prefix": subnet.prefixlen,
        "gateway_bridge": "dpu-sim-gw", "gateway_next_hop": str(subnet[1]),
        "uplink_bridge": uplink["bridge_name"], "uplink_router": str(upnet[1]),
        "uplink_subnet": str(upnet), "external_subnet": str(external),
        "external_router": str(external[1]), "external_server": str(external[10]),
        "host_interface": f'eth0-{links.get("mgmt_port_vfs_count", 2) + 1}',
        "pairs": [{"host": v["host"], "dpu": v["name"], "gateway_ip": str(subnet[2 + i]),
                   "dpu_uplink_ip": str(upnet[10 + i]), "host_uplink_ip": str(upnet[254 - i])}
                  for i, v in enumerate(dpus)],
    }


def cleanup():
    runtime = os.getenv("DPU_SIM_CONTAINER_RUNTIME") or ("podman" if shutil.which("podman") else "docker")
    if not shutil.which(runtime):
        return
    removed_router = False
    for name in (ROUTER, SERVER):
        found = run(runtime, "ps", "-a", "--filter", f"name=^{name}$", "--format", "{{.Names}}")
        if not found:
            continue
        if run(runtime, "inspect", "-f", '{{index .Config.Labels "' + LABEL + '"}}', name) != "true":
            raise ValueError(f"refusing to remove unrelated container {name}")
        run(runtime, "rm", "-f", name)
        removed_router |= name == ROUTER
    if removed_router:
        run("ovs-vsctl", "--if-exists", "del-port", "dsvm-up")
    # The veth roots live in the host namespace while their peers are moved
    # into the disposable FRR/server namespaces.  Removing a container does
    # not reliably remove the host-side roots, so clean up the helper's
    # uniquely named links even when the owned containers are already gone.
    for name in ("dsvm-gw", "dsvm-up", "dsvm-ext", "dsvm-extp"):
        if Path(f"/sys/class/net/{name}").exists():
            run("ip", "link", "delete", name)


def main():
    import yaml

    config_path, state_dir, image = sys.argv[1:]
    cfg = yaml.safe_load(Path(config_path).read_text())
    topology = plan(cfg)
    state = Path(state_dir).resolve()
    state.mkdir(parents=True, exist_ok=True)
    runtime = os.getenv("DPU_SIM_CONTAINER_RUNTIME") or ("podman" if shutil.which("podman") else "docker")
    # Reject unrelated containers and interfaces before making changes.
    owned = {}
    for name in (ROUTER, SERVER):
        found = run(runtime, "ps", "-a", "--filter", f"name=^{name}$", "--format", "{{.Names}}")
        owned[name] = bool(found)
        if found and run(runtime, "inspect", "-f", '{{index .Config.Labels "' + LABEL + '"}}', name) != "true":
            raise ValueError(f"refusing to replace unrelated container {name}")
    for name in ("dsvm-gw", "dsvm-up", "dsvm-ext"):
        if Path(f"/sys/class/net/{name}").exists() and not owned[ROUTER]:
            raise ValueError(f"interface {name} already exists without an owned router")
    for name in (ROUTER, SERVER):
        if owned[name]:
            run(runtime, "rm", "-f", name)

    frr = state / "frr"
    frr.mkdir(exist_ok=True)
    (frr / "daemons").write_text('zebra=yes\nbgpd=yes\nstaticd=yes\nvtysh_enable=yes\n'
                               'zebra_options=" -A 127.0.0.1 -s 90000000"\nbgpd_options=" -A 127.0.0.1"\nstaticd_options=" -A 127.0.0.1"\n')
    peers = [p[k] for p in topology["pairs"] for k in ("gateway_ip", "dpu_uplink_ip")]
    config = ["frr defaults traditional", "hostname dpu-sim-vm-frr", "ip forwarding",
              "router bgp 64512", f' bgp router-id {topology["gateway_router"]}', " no bgp ebgp-requires-policy"]
    config += [f" neighbor {p} remote-as 64512" for p in peers]
    config += [" address-family ipv4 unicast", f'  network {topology["external_subnet"]}']
    config += [f"  neighbor {p} route-reflector-client" for p in peers]
    config += [" exit-address-family", "!"]
    (frr / "vtysh.conf").write_text("service integrated-vtysh-config\n")
    (frr / "frr.conf").write_text("\n".join(config) + "\n")
    # FRR 10.6 requests SYS_ADMIN in addition to network capabilities at startup.
    run(runtime, "run", "-d", "--name", ROUTER, "--label", LABEL + "=true", "--network", "none",
        "--cap-add", "NET_ADMIN", "--cap-add", "NET_RAW", "--cap-add", "SYS_ADMIN", "-v", f"{frr}:/etc/frr:Z", image)
    run(runtime, "run", "-d", "--name", SERVER, "--label", LABEL + "=true", "--network", "none",
        "registry.k8s.io/e2e-test-images/agnhost:2.53", "netexec", "--http-port=8080")
    router_pid = run(runtime, "inspect", "-f", "{{.State.Pid}}", ROUTER)
    server_pid = run(runtime, "inspect", "-f", "{{.State.Pid}}", SERVER)

    def net(pid, *args):
        return run("nsenter", "-t", pid, "-n", *args)

    def attach(root, bridge, iface, cidr, ovs=False):
        run("ip", "link", "add", root, "type", "veth", "peer", "name", root + "p")
        run("ip", "link", "set", root + "p", "netns", router_pid)
        net(router_pid, "ip", "link", "set", root + "p", "name", iface)
        if ovs:
            run("ovs-vsctl", "--may-exist", "add-port", bridge, root)
        else:
            run("ip", "link", "set", root, "master", bridge)
        run("ip", "link", "set", root, "up")
        net(router_pid, "ip", "link", "set", iface, "up")
        net(router_pid, "ip", "addr", "replace", cidr, "dev", iface)

    attach("dsvm-gw", topology["gateway_bridge"], "gateway", f'{topology["gateway_router"]}/{topology["gateway_prefix"]}')
    attach("dsvm-up", topology["uplink_bridge"], "uplink", f'{topology["uplink_router"]}/24', ovs=True)
    run("ip", "link", "add", "dsvm-ext", "type", "veth", "peer", "name", "dsvm-extp")
    run("ip", "link", "set", "dsvm-ext", "netns", router_pid)
    run("ip", "link", "set", "dsvm-extp", "netns", server_pid)
    for pid, iface, ip in ((router_pid, "dsvm-ext", topology["external_router"]), (server_pid, "dsvm-extp", topology["external_server"])):
        net(pid, "ip", "link", "set", iface, "up")
        net(pid, "ip", "addr", "replace", ip + "/24", "dev", iface)
    net(server_pid, "ip", "route", "replace", "default", "via", topology["external_router"])
    net(router_pid, "ip", "route", "replace", "default", "via", topology["gateway_next_hop"])
    net(router_pid, "sysctl", "-w", "net.ipv4.ip_forward=1")

    mgmt = next(n for n in cfg["networks"] if n["type"] == "mgmt")
    ssh_cfg = cfg["ssh"]
    def guest(name, script):
        domain = ET.fromstring(run("virsh", "dumpxml", name))
        mac = next(i.find("mac").get("address") for i in domain.findall("./devices/interface")
                   if i.find("source") is not None and i.find("source").get("network") == mgmt["name"])
        leases = run("virsh", "net-dhcp-leases", mgmt["name"], "--mac", mac)
        ip = re.search(r"\b(?:\d{1,3}\.){3}\d{1,3}/\d+", leases)
        if not ip:
            raise ValueError(f"no management DHCP lease for {name}")
        run("ssh", "-i", os.path.expanduser(ssh_cfg["key_path"]), "-o", "BatchMode=yes",
            "-o", "StrictHostKeyChecking=accept-new", "-o", f"UserKnownHostsFile={state / 'known_hosts'}",
            f'{ssh_cfg["user"]}@{ip[0].split("/")[0]}', "sudo bash -se", stdin=script)

    host_if = topology["host_interface"]
    rep = "rep0-" + host_if.split("-")[1]
    for pair in topology["pairs"]:
        guest(pair["host"], f"ip link set {host_if} up\nip addr replace {pair['host_uplink_ip']}/24 dev {host_if}\nip route replace default via {topology['uplink_router']} dev {host_if} metric 400\n")
        guest(pair["dpu"], f"""ovs-vsctl --may-exist add-br breth-uplink
ovs-vsctl --may-exist add-port breth-uplink layer2
ovs-vsctl --if-exists del-port {rep}
ovs-vsctl --may-exist add-port breth-uplink {rep}
ovs-vsctl br-set-external-id breth-uplink bridge-uplink layer2
ip link set layer2 up
ip link set {rep} up
ip link set breth-uplink up
ip addr replace {pair['dpu_uplink_ip']}/24 dev breth-uplink
sysctl -w net.ipv4.conf.all.rp_filter=0 net.ipv4.conf.breth-uplink.rp_filter=0
""")
    (state / "topology.json").write_text(json.dumps(topology, indent=2) + "\n")
    receive = {
        "apiVersion": "frrk8s.metallb.io/v1beta1", "kind": "FRRConfiguration",
        "metadata": {"name": "receive-all", "namespace": "frr-k8s-system", "labels": {"name": "receive-all"}},
        "spec": {"bgp": {"routers": [{"asn": 64512, "neighbors": [{
            "asn": 64512, "address": topology["gateway_router"],
            "toReceive": {"allowed": {"mode": "all"}},
            "toAdvertise": {"allowed": {"mode": "all"}},
        }]}]}},
    }
    (state / "receive-all.yaml").write_text(yaml.safe_dump(receive))
    # Container-running does not imply that FRR's individual daemons started.
    for attempt in range(30):
        try:
            run(runtime, "exec", ROUTER, "vtysh", "-c", "show bgp summary")
            break
        except subprocess.CalledProcessError:
            if attempt == 29:
                raise RuntimeError("external FRR BGP daemon did not start; inspect container logs")
            time.sleep(1)
    print(f"VM routing topology saved to {state / 'topology.json'}")


if __name__ == "__main__":
    if sys.argv[1:] == ["--cleanup"]:
        cleanup()
    else:
        main()
