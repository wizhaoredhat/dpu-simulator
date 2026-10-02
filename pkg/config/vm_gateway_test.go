package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestVMGatewayUsesActualLibvirtNetwork(t *testing.T) {
	cfg, err := LoadConfig("../../config-ovnk-offload.yaml")
	require.NoError(t, err)
	// Use a non-default gateway to catch code that assumes the first address.
	cfg.GetNetworkByType(K8sNetworkName).Gateway = "192.168.123.9"
	require.Equal(t, "172.30.0.0/24", cfg.DPUHostGatewaySubnet())
	require.Equal(t, "--gateway-interface=gateway --gateway-router-subnet=172.30.0.0/24 --gateway-nexthop=172.30.0.1", cfg.GatewayOpts("dpu-sim-dpu"))
	require.Equal(t, "--gateway-interface=k8s", cfg.GatewayOpts("dpu-sim-host"))
}

func TestVMGatewayAddressPlan(t *testing.T) {
	cfg, err := LoadConfig("../../config-ovnk-offload.yaml")
	require.NoError(t, err)
	for node, want := range map[string]string{"dpu-1-1": "172.30.0.2", "dpu-2-1": "172.30.0.3", "host-1-1": "172.30.0.254", "host-2-1": "172.30.0.253"} {
		ip, err := cfg.VMGatewayIP(node)
		require.NoError(t, err)
		require.Equal(t, want, ip)
	}
	_, err = cfg.VMGatewayIP("master-1")
	require.Error(t, err)
	cfg.GetHostToDpuNetwork().GatewaySubnet = "10.100.0.0/29"
	require.NoError(t, cfg.validateVMGateway())
	ip, err := cfg.VMGatewayIP("host-2-1")
	require.NoError(t, err)
	require.Equal(t, "10.100.0.5", ip)
	cfg.GetHostToDpuNetwork().GatewaySubnet = "10.100.0.0/30"
	require.Error(t, cfg.validateVMGateway())
	cfg.GetHostToDpuNetwork().GatewaySubnet = "192.168.123.0/24"
	require.ErrorContains(t, cfg.validateVMGateway(), "overlaps")
}
