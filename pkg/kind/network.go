package kind

import (
	"fmt"
	"net"
)

func parseIPv4CIDR(cidr string) (*net.IPNet, error) {
	_, subnet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}
	if subnet.IP.To4() == nil {
		return nil, fmt.Errorf("%s is not an IPv4 subnet", cidr)
	}
	ones, _ := subnet.Mask.Size()
	if ones > 30 {
		return nil, fmt.Errorf("%s does not have enough usable IPv4 addresses", cidr)
	}
	return subnet, nil
}

func parseIPv6CIDR(cidr string) (*net.IPNet, error) {
	_, subnet, err := net.ParseCIDR(cidr)
	if err != nil {
		return nil, err
	}
	if subnet.IP.To4() != nil || subnet.IP.To16() == nil {
		return nil, fmt.Errorf("%s is not an IPv6 subnet", cidr)
	}
	ones, bits := subnet.Mask.Size()
	if bits != 128 {
		return nil, fmt.Errorf("%s is not an IPv6 subnet", cidr)
	}
	if ones > 126 {
		return nil, fmt.Errorf("%s does not have enough usable IPv6 addresses", cidr)
	}
	return subnet, nil
}
