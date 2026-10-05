package k8s

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/ovn-kubernetes/dpu-simulator/pkg/config"
	"github.com/ovn-kubernetes/dpu-simulator/pkg/platform"
)

type initCommandRecorder struct {
	platform.CommandExecutor
	command string
}

func (e *initCommandRecorder) String() string { return "bootstrap-recorder" }
func (e *initCommandRecorder) ExecuteWithTimeout(command string, _ time.Duration) (string, string, error) {
	e.command = command
	return "", "", errors.New("stop before initializing a real cluster")
}

func TestBootstrapCanOmitKubeProxyForOVN(t *testing.T) {
	for _, skip := range []bool{false, true} {
		e := &initCommandRecorder{}
		m := NewK8sMachineManager(&config.Config{})
		_, err := m.InitializeControlPlane(e, "master-1", "192.168.123.11", "10.244.0.0/16", "10.245.0.0/16", "192.168.123.11:6443", nil, skip)
		if err == nil {
			t.Fatal("expected recorder to stop bootstrap")
		}
		if got := strings.Contains(e.command, "--skip-phases=addon/kube-proxy"); got != skip {
			t.Fatalf("skip proxy %v: %s", skip, e.command)
		}
	}
}
