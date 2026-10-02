package platform

import (
	"bytes"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestSSHFileCommandPreservesContent(t *testing.T) {
	for name, data := range map[string][]byte{
		"script":  []byte("#!/bin/sh\nfind /run/openvswitch -type s -exec echo '{}' +\n"),
		"binary":  {0, 255, 10, 39, 0},
		"heredoc": []byte("EOF\n$(printf changed)\n`printf changed`\nno trailing newline"),
		"empty":   {},
	} {
		t.Run(name, func(t *testing.T) {
			filename := "script"
			if name == "empty" {
				filename = "script ' quoted"
			}
			path := filepath.Join(t.TempDir(), filename)
			output, err := exec.Command("sh", "-c", sshWriteFileCommand(path, data, 0750)).CombinedOutput()
			if err != nil {
				t.Fatalf("write command: %v: %s", err, output)
			}
			got, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(got, data) {
				t.Fatalf("contents changed: got %q, want %q", got, data)
			}
			info, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			if info.Mode().Perm() != 0750 {
				t.Fatalf("mode: %o", info.Mode().Perm())
			}
		})
	}
}
