package k8s

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/ovn-kubernetes/dpu-simulator/pkg/platform"
	"github.com/stretchr/testify/require"
)

type bootstrapExecutor struct {
	platform.CommandExecutor
	path string
}

func (e bootstrapExecutor) ExecuteRetryWithTimeout(command string, _, _ time.Duration) (string, string, error) {
	c := exec.Command("sh", "-c", command)
	c.Env = append(os.Environ(), "PATH="+e.path+":"+os.Getenv("PATH"))
	b, err := c.CombinedOutput()
	return string(b), "", err
}

func TestWaitNodeInternalIPBeforeCNI(t *testing.T) {
	// Model a newly joined node: the API has its addresses but Ready is false.
	// Execute the actual remote shell predicate against a kubectl stand-in.
	dir := t.TempDir()
	require.NoError(t, os.WriteFile(filepath.Join(dir, "sudo"), []byte("#!/bin/sh\nexec \"$@\"\n"), 0o755))
	require.NoError(t, os.WriteFile(filepath.Join(dir, "kubectl"), []byte(`#!/bin/sh
case "$*" in
  *'get node worker-1'*'jsonpath='*) printf '192.168.123.12 fd00::12' ;;
  *) echo 'node is NotReady until CNI installation' >&2; exit 1 ;;
esac
`), 0o755))
	e := bootstrapExecutor{path: dir}
	require.NoError(t, WaitNodeInternalIP(e, "worker-1", "192.168.123.12", time.Second))
	require.Error(t, WaitNodeInternalIP(e, "worker-1", "192.168.120.12", time.Second))
	require.Error(t, WaitNodeInternalIP(e, "worker-1; touch /tmp/invalid", "192.168.123.12", time.Second))
}
