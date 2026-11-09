# Topology

A fibre core links racks A and B; each floor is connected at 10 Gbit/s.

The main Internet link is a dedicated 1 Gbit/s fibre, with a 5G backup link.

The firewalls sit between the core and both Internet links: see [Firewall](firewall.md).

## Switches

Two core switches, core-a (rack A) and core-b (rack B), and one access switch per floor. The
[switch inventory](switch-inventory.csv) lists their ports and firmware versions, checked on
4 October 2026 after the Sunday maintenance: firmware 7.4.2 on the core switches, 7.3.9 on
the floor switches.
