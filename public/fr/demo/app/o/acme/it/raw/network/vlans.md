# VLANs

| VLAN | Use | Subnet |
|---|---|---|
| 10 | servers | 10.10.0.0/24 |
| 20 | workstations | 10.20.0.0/22 |
| 30 | phones | 10.30.0.0/24 |
| 40 | guests (Wi-Fi) | 10.40.0.0/24 |
| 99 | management | 10.99.0.0/24 |

The guest VLAN only reaches the Internet: see [Wi-Fi](wifi.md) and the
[firewall rules](firewall.md).
