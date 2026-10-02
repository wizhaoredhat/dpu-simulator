#!/usr/bin/env python3
"""Offline tests for VM routing address planning; no libvirt or root required."""
import importlib.util
from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("vm_routing", ROOT / "scripts/configure-vm-routing.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class RoutingPlanTest(unittest.TestCase):
    def setUp(self):
        self.cfg = yaml.safe_load((ROOT / "config-ovnk-offload.yaml").read_text())

    def test_uses_vm_pairs_and_reserved_uplink(self):
        p = module.plan(self.cfg)
        self.assertEqual("eth0-9", p["host_interface"])
        self.assertEqual("172.30.0.4", p["gateway_router"])
        self.assertEqual("host-1-1", p["pairs"][0]["host"])
        self.assertEqual("dpu-2-1", p["pairs"][1]["dpu"])
        self.assertEqual("172.31.0.11", p["pairs"][1]["dpu_uplink_ip"])

    def test_gateway_uses_custom_subnet_and_excludes_vfs(self):
        links = next(n for n in self.cfg["networks"] if n["type"] == "HostToDpu")
        links["gateway_subnet"] = "10.100.0.0/29"
        p = module.plan(self.cfg)
        self.assertEqual("10.100.0.4", p["gateway_router"])
        self.assertEqual(["10.100.0.2", "10.100.0.3"], [v["gateway_ip"] for v in p["pairs"]])
        self.assertEqual("dpu-sim-gw", p["gateway_bridge"])
        links["gateway_subnet"] = "10.100.0.0/30"
        with self.assertRaisesRegex(ValueError, "lacks space"):
            module.plan(self.cfg)

    def test_missing_reservation_is_rejected(self):
        next(n for n in self.cfg["networks"] if n["type"] == "HostToDpu")["uplink_vfs_count"] = 0
        with self.assertRaisesRegex(ValueError, "uplink_vfs_count"):
            module.plan(self.cfg)

    def test_overlapping_lab_subnet_is_rejected(self):
        next(n for n in self.cfg["networks"] if n["type"] == "mgmt")["gateway"] = "172.31.0.1"
        with self.assertRaisesRegex(ValueError, "overlaps"):
            module.plan(self.cfg)


if __name__ == "__main__":
    unittest.main()
