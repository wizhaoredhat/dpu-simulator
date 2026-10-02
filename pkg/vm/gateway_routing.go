package vm

import (
	"fmt"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/ovn-kubernetes/dpu-simulator/pkg/config"
	"github.com/ovn-kubernetes/dpu-simulator/pkg/log"
	"github.com/ovn-kubernetes/dpu-simulator/pkg/network"
	"github.com/ovn-kubernetes/dpu-simulator/pkg/platform"
)

const vmGatewayRoutingComment = "dpu-simulator-vm-gateway-routing"

var nftOwnedHandleRE = regexp.MustCompile(`comment "` + regexp.QuoteMeta(vmGatewayRoutingComment) + `".*# handle ([0-9]+)`)

// configureGatewayRouting opens host forwarding between the k8s underlay and
// the dedicated DPU gateway network on the libvirt host.
//
// Why: OVN puts Geneve/tunnel and gateway next-hop addresses on dpu-sim-gw,
// while the Kubernetes API and node IPs stay on the k8s underlay. Packets must
// cross those two bridges. Libvirt NAT networks are isolated by default
// (nftables ip libvirt_network forward, iptables FORWARD, and often firewalld),
// so without an explicit accept the DPU gateway cannot reach the API.
//
// Kind counterpart: pkg/kind/routing.go setupDPUGatewayRouting does the same
// for the kind and dpu-sim-gateway container networks.
func (m *VMManager) configureGatewayRouting(cleanup bool) error {
	if !m.config.IsVMMode() || !m.config.IsOffloadDPU() {
		return nil
	}
	k8s := m.config.GetNetworkByType(config.K8sNetworkName)
	if k8s == nil {
		return fmt.Errorf("missing k8s network")
	}
	prefix, err := config.PrefixLenFromSubnetMask(k8s.SubnetMask)
	if err != nil {
		return err
	}
	_, kSubnet, err := net.ParseCIDR(fmt.Sprintf("%s/%d", k8s.Gateway, prefix))
	if err != nil {
		return err
	}
	_, gSubnet, err := net.ParseCIDR(m.config.DPUHostGatewaySubnet())
	if err != nil {
		return err
	}
	kBridge := k8s.BridgeName
	gBridge := config.VMGatewayBridge
	if cleanup {
		return cleanupVMGatewayRouting(m.hostExec, kBridge, gBridge, kSubnet, gSubnet)
	}
	return setupVMGatewayRouting(m.hostExec, kBridge, gBridge, kSubnet, gSubnet)
}

func setupVMGatewayRouting(
	cmdExec platform.CommandExecutor,
	kBridge, gBridge string,
	kSubnet, gSubnet *net.IPNet,
) error {
	if err := syncLibvirtNFTForward(cmdExec, false, kBridge, gBridge, kSubnet, gSubnet); err != nil {
		return err
	}
	if err := syncIptablesForward(cmdExec, false, kBridge, gBridge, kSubnet, gSubnet); err != nil {
		return err
	}
	if err := syncFirewalldRichRules(cmdExec, false, kBridge, gBridge, kSubnet, gSubnet); err != nil {
		return err
	}
	if err := network.EnableIPv4BridgeForwarding(cmdExec, kBridge); err != nil {
		return fmt.Errorf("enable IPv4 forwarding on %s: %w", kBridge, err)
	}
	if err := network.EnableIPv4BridgeForwarding(cmdExec, gBridge); err != nil {
		return fmt.Errorf("enable IPv4 forwarding on %s: %w", gBridge, err)
	}
	return nil
}

func cleanupVMGatewayRouting(
	cmdExec platform.CommandExecutor,
	kBridge, gBridge string,
	kSubnet, gSubnet *net.IPNet,
) error {
	if err := syncLibvirtNFTForward(cmdExec, true, kBridge, gBridge, kSubnet, gSubnet); err != nil {
		return err
	}
	if err := syncIptablesForward(cmdExec, true, kBridge, gBridge, kSubnet, gSubnet); err != nil {
		return err
	}
	return syncFirewalldRichRules(cmdExec, true, kBridge, gBridge, kSubnet, gSubnet)
}

func syncLibvirtNFTForward(
	cmdExec platform.CommandExecutor,
	cleanup bool,
	kBridge, gBridge string,
	kSubnet, gSubnet *net.IPNet,
) error {
	if !libvirtNFTForwardAvailable(cmdExec) {
		return nil
	}
	if err := deleteOwnedNFTForwardRules(cmdExec); err != nil {
		return err
	}
	if cleanup {
		return nil
	}
	rules := [][]string{
		{"iifname", kBridge, "oifname", gBridge, "ip", "saddr", kSubnet.String(), "ip", "daddr", gSubnet.String(), "accept", "comment", vmGatewayRoutingComment},
		{"iifname", gBridge, "oifname", kBridge, "ip", "saddr", gSubnet.String(), "ip", "daddr", kSubnet.String(), "accept", "comment", vmGatewayRoutingComment},
	}
	for _, rule := range rules {
		args := append([]string{"nft", "insert", "rule", "ip", "libvirt_network", "forward"}, rule...)
		if err := cmdExec.RunCmd(log.LevelInfo, "sudo", args...); err != nil {
			return fmt.Errorf("nft insert forward rule: %w", err)
		}
	}
	return nil
}

func libvirtNFTForwardAvailable(cmdExec platform.CommandExecutor) bool {
	return cmdExec.RunCmd(log.LevelDebug, "sudo", "nft", "list", "chain", "ip", "libvirt_network", "forward") == nil
}

func deleteOwnedNFTForwardRules(cmdExec platform.CommandExecutor) error {
	stdout, stderr, err := cmdExec.ExecuteWithTimeout(
		"sudo nft -a list chain ip libvirt_network forward", 30*time.Second)
	if err != nil {
		return fmt.Errorf("nft list forward chain: %w: %s", err, stderr)
	}
	for _, handle := range ownedNFTHandles(stdout) {
		if err := cmdExec.RunCmd(log.LevelDebug, "sudo", "nft", "delete", "rule", "ip", "libvirt_network", "forward", "handle", handle); err != nil {
			return fmt.Errorf("nft delete handle %s: %w", handle, err)
		}
	}
	return nil
}

func ownedNFTHandles(listOutput string) []string {
	var handles []string
	for _, line := range strings.Split(listOutput, "\n") {
		match := nftOwnedHandleRE.FindStringSubmatch(line)
		if len(match) == 2 {
			handles = append(handles, match[1])
		}
	}
	return handles
}

// syncIptablesForward keeps bidirectional FORWARD accepts between the k8s
// underlay and DPU gateway bridges. Owned rules are tagged with
// vmGatewayRoutingComment so they can be deleted and re-inserted idempotently;
// cleanup removes them without recreating.
func syncIptablesForward(
	cmdExec platform.CommandExecutor,
	cleanup bool,
	kBridge, gBridge string,
	kSubnet, gSubnet *net.IPNet,
) error {
	if !hostHasCommand(cmdExec, "iptables") {
		return nil
	}
	directions := []struct {
		in, out  string
		src, dst *net.IPNet
	}{
		{kBridge, gBridge, kSubnet, gSubnet},
		{gBridge, kBridge, gSubnet, kSubnet},
	}
	for _, d := range directions {
		if err := network.DeleteIptablesAcceptRule(cmdExec, "FORWARD", vmGatewayRoutingComment, d.in, d.out, d.src, d.dst); err != nil {
			return err
		}
		if !cleanup {
			if err := network.EnsureIptablesAcceptRule(cmdExec, "FORWARD", vmGatewayRoutingComment, d.in, d.out, d.src, d.dst); err != nil {
				return err
			}
		}
	}
	return nil
}

func syncFirewalldRichRules(
	cmdExec platform.CommandExecutor,
	cleanup bool,
	kBridge, gBridge string,
	kSubnet, gSubnet *net.IPNet,
) error {
	if !network.FirewalldIsRunning(cmdExec) {
		return nil
	}
	directions := []struct {
		inBridge string
		src, dst *net.IPNet
	}{
		{kBridge, kSubnet, gSubnet},
		{gBridge, gSubnet, kSubnet},
	}
	for _, d := range directions {
		zone, err := firewalldZoneOfInterface(cmdExec, d.inBridge)
		if err != nil {
			return err
		}
		if zone == "" || zone == "no zone" {
			if cleanup {
				continue
			}
			return fmt.Errorf("no firewalld zone for %s", d.inBridge)
		}
		rule := firewalldRichRule(d.src, d.dst)
		if cleanup {
			if firewalldRichRuleExists(cmdExec, zone, rule) {
				if err := cmdExec.RunCmd(log.LevelDebug, "sudo", "firewall-cmd", "--zone="+zone, "--remove-rich-rule="+rule); err != nil {
					return fmt.Errorf("firewalld remove rich rule: %w", err)
				}
			}
			continue
		}
		if err := cmdExec.RunCmd(log.LevelInfo, "sudo", "firewall-cmd", "--zone="+zone, "--add-rich-rule="+rule); err != nil {
			return fmt.Errorf("firewalld add rich rule: %w", err)
		}
	}
	return nil
}

func firewalldRichRule(src, dst *net.IPNet) string {
	return fmt.Sprintf("rule family=ipv4 source address=%s destination address=%s accept", src.String(), dst.String())
}

func firewalldZoneOfInterface(cmdExec platform.CommandExecutor, iface string) (string, error) {
	stdout, stderr, err := cmdExec.ExecuteWithTimeout(
		"firewall-cmd --get-zone-of-interface="+platform.ShQuote(iface), 30*time.Second)
	if err != nil {
		// firewall-cmd prints "no zone" on stderr/stdout with non-zero exit when unassigned.
		out := strings.TrimSpace(stdout)
		if out == "" {
			out = strings.TrimSpace(stderr)
		}
		if out == "no zone" {
			return out, nil
		}
		return "", fmt.Errorf("firewalld zone for %s: %w: %s", iface, err, stderr)
	}
	return strings.TrimSpace(stdout), nil
}

func firewalldRichRuleExists(cmdExec platform.CommandExecutor, zone, rule string) bool {
	return cmdExec.RunCmd(log.LevelDebug, "sudo", "firewall-cmd", "--zone="+zone, "--query-rich-rule="+rule) == nil
}

func hostHasCommand(cmdExec platform.CommandExecutor, name string) bool {
	_, _, err := cmdExec.ExecuteWithTimeout("command -v "+platform.ShQuote(name), 5*time.Second)
	return err == nil
}
