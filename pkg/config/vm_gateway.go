package config

import (
	"encoding/binary"
	"fmt"
	"net"
)

const VMGatewayInterface = "gateway"
const VMGatewayBridge = "dpu-sim-gw"

// VMGatewayIP assigns DPUs from the low end and host VFs from the high end.
// Ordering follows GetHostDPUPairs, also used by the FRR routing helper.
func (c *Config) VMGatewayIP(node string) (string, error) {
	_, subnet, err := net.ParseCIDR(c.DPUHostGatewaySubnet())
	if err != nil || subnet.IP.To4() == nil {
		return "", fmt.Errorf("invalid IPv4 gateway subnet")
	}
	base := binary.BigEndian.Uint32(subnet.IP.To4())
	mask := binary.BigEndian.Uint32(subnet.Mask)
	pairs := c.GetHostDPUPairs("")
	if err := validateIPv4CIDRCapacity(subnet.String(), 1+2*len(pairs)); err != nil {
		return "", err
	}
	for i, pair := range pairs {
		var value uint32
		switch node {
		case pair.DPUNode:
			value = base + 2 + uint32(i)
		case pair.HostNode:
			value = (base | ^mask) - 1 - uint32(i)
		default:
			continue
		}
		ip := make(net.IP, 4)
		binary.BigEndian.PutUint32(ip, value)
		return ip.String(), nil
	}
	return "", fmt.Errorf("node %s has no host/DPU gateway pair", node)
}

// VMNetworks includes the automatically managed offload gateway network.
func (c *Config) VMNetworks() []NetworkConfig {
	out := append([]NetworkConfig(nil), c.Networks...)
	if !c.IsVMMode() || !c.IsOffloadDPU() {
		return out
	}
	_, subnet, err := net.ParseCIDR(c.DPUHostGatewaySubnet())
	if err != nil {
		return out
	} // Invalid configurations are rejected at load time.
	out = append(out, NetworkConfig{Name: c.DPUGatewayNetworkName(), Type: VMGatewayInterface,
		BridgeName: VMGatewayBridge, Gateway: c.DPUGatewayNextHop(), SubnetMask: net.IP(subnet.Mask).String(),
		Mode: "nat", NICModel: "virtio", AttachTo: DpuType})
	return out
}

func (c *Config) validateVMGateway() error {
	_, gw, err := net.ParseCIDR(c.DPUHostGatewaySubnet())
	if err != nil || gw.IP.To4() == nil {
		return fmt.Errorf("invalid IPv4 gateway_subnet")
	}
	if err := validateIPv4CIDRCapacity(gw.String(), 1+2*len(c.GetHostDPUPairs(""))); err != nil {
		return err
	}
	if c.GetNetworkByType(K8sNetworkName) == nil {
		return fmt.Errorf("VM offload requires a k8s network")
	}
	for _, n := range c.Networks {
		if n.Type == VMGatewayInterface || n.Name == c.DPUGatewayNetworkName() || n.BridgeName == VMGatewayBridge {
			return fmt.Errorf("VM gateway network name, type and bridge are reserved")
		}
		if n.Gateway == "" || n.SubnetMask == "" {
			continue
		}
		prefix, err := PrefixLenFromSubnetMask(n.SubnetMask)
		if err != nil {
			return err
		}
		_, other, err := net.ParseCIDR(fmt.Sprintf("%s/%d", n.Gateway, prefix))
		if err != nil {
			return err
		}
		if gw.Contains(other.IP) || other.Contains(gw.IP) {
			return fmt.Errorf("gateway_subnet overlaps network %s", n.Name)
		}
	}
	return nil
}
