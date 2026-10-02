package cni

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ovn-kubernetes/dpu-simulator/pkg/config"
	"github.com/stretchr/testify/require"
)

func TestVMFRREnvDescribesVMTopology(t *testing.T) {
	cfg, err := config.LoadConfig("../../config-ovnk-offload.yaml")
	require.NoError(t, err)
	cfg.Kubernetes.KubeconfigDir = t.TempDir()
	m := &CNIManager{config: cfg}
	require.NoError(t, m.writeFRRK8sRemoteEnv("dpu-sim-dpu", "/tmp/remote", "/tmp/host"))
	b, err := os.ReadFile(filepath.Join(cfg.Kubernetes.KubeconfigDir, "helm-values", "dpu-sim-dpu-frr-k8s.env"))
	require.NoError(t, err)
	require.Contains(t, string(b), `DPU_SIM_GATEWAY_NETWORK="dpu-sim-gateway"`)
	require.Contains(t, string(b), `DPU_SIM_GATEWAY_SUBNET="172.30.0.0/24"`)
	require.Contains(t, string(b), `FRR_K8S_REMOTE_NODE_MAP="host-1-1=dpu-1-1,host-2-1=dpu-2-1"`)
}

func TestDPUHostUDNMasqueradeAddressSpace(t *testing.T) {
	cfg, err := config.LoadConfig("../../config-ovnk-offload.yaml")
	require.NoError(t, err)
	m := &CNIManager{config: cfg}
	overrides, err := m.ovnkHelmOverrides(ovnkModeDPUHost, "dpu-sim-host", "test:latest", false, true)
	require.NoError(t, err)
	values := map[string]any{}
	for _, override := range overrides {
		values[override.key] = override.value
	}
	// Upstream Kind reserves space for per-UDN masquerade addresses. The
	// chart's default IPv4 /29 has no room even for network ID 2.
	require.Equal(t, "169.254.0.0/17", values["global.v4MasqueradeSubnet"])
	require.Equal(t, "fd69::/112", values["global.v6MasqueradeSubnet"])
}
