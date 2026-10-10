# VPN

Remote access uses WireGuard. Profiles are generated from the `infra/vpn` repository on
[GitLab](gitlab.md).

Every newcomer receives their profile on their first day (see [onboarding](../team/onboarding.md)).
A profile is revoked the day someone leaves (see [offboarding](../procedures/offboarding.md)).

## Troubleshooting

- **The tunnel is up but nothing answers:** check that the profile still has `AllowedIPs`
  for the server VLAN (10.10.0.0/24, see [VLANs](../network/vlans.md)).
- **Connected at home, not at a hotel:** some networks block UDP. Use the TCP fallback profile.
- **Lost laptop:** revoke the profile at once, as for an [offboarding](../procedures/offboarding.md).
