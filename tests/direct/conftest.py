"""Shared helpers for direct mode tests."""


def to_hex(addr):
    """Return the checksummed hex form used by contract view results."""
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    from genlayer.types import Address

    return Address(addr).as_hex
