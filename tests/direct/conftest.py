"""Shared helpers for direct mode tests."""

from pathlib import Path
import sys

import pytest

# The upstream direct runner derives its cache from Path.home(). Keep project
# tests runnable in containers where the root home is intentionally read-only.
import gltest.direct.loader as direct_loader
import gltest.direct.sdk_compat as sdk_compat
import gltest.direct.sdk_loader as sdk_loader
import gltest.direct.vm as direct_vm_module
import gltest.direct.wasi_mock as wasi_mock

sdk_loader.CACHE_DIR = Path("/tmp/dissent-gltest-cache")


_UNSET = object()


def _import_types():
    """Load either the current or legacy GenLayer type module."""
    try:
        from genlayer import types
    except ImportError:
        import genlayer.py.types as types
    return types


def _import_calldata():
    """Load calldata from either the current or legacy SDK layout."""
    try:
        from genlayer import calldata
    except ImportError:
        import genlayer.py.calldata as calldata
    return calldata


def _import_address():
    return _import_types().Address


def _import_address_u256():
    types = _import_types()
    return types.Address, types.u256


def _import_lazy():
    return _import_types().Lazy


def _sync_message_context(
    *,
    contract_address=_UNSET,
    sender_address=_UNSET,
    origin_address=_UNSET,
    value=_UNSET,
    chain_id=_UNSET,
) -> None:
    """Update message state for both current and legacy SDK layouts."""
    message_mod = sys.modules.get("genlayer.message")
    message_raw = getattr(message_mod, "raw", None) if message_mod else None
    legacy_gl = sys.modules.get("genlayer.gl")
    legacy_raw = getattr(legacy_gl, "message_raw", None) if legacy_gl else None

    updates = {
        "contract_address": contract_address,
        "sender_address": sender_address,
        "origin_address": origin_address,
        "value": value,
        "chain_id": chain_id,
    }
    for name, next_value in updates.items():
        if next_value is _UNSET:
            continue
        if message_mod is not None:
            setattr(message_mod, name, next_value)
        if isinstance(message_raw, dict):
            message_raw[name] = next_value
        if isinstance(legacy_raw, dict):
            legacy_raw[name] = next_value

    if legacy_gl is not None and isinstance(legacy_raw, dict):
        message_type = getattr(legacy_gl, "MessageType", None)
        if message_type is not None:
            types = _import_types()
            legacy_gl.message = message_type(
                contract_address=legacy_raw["contract_address"],
                sender_address=legacy_raw["sender_address"],
                origin_address=legacy_raw["origin_address"],
                value=types.u256(legacy_raw["value"]),
                chain_id=types.u256(legacy_raw["chain_id"]),
            )


# genlayer-test 0.30.0rc2 assumes the v0.3 SDK module layout. Dissent's
# dependency header intentionally pins the v0.2 legacy SDK, so provide the
# small compatibility surface the RC runner omitted.
sdk_compat.import_types = _import_types
sdk_compat.import_calldata = _import_calldata
sdk_compat.import_address = _import_address
sdk_compat.import_address_u256 = _import_address_u256
sdk_compat.import_lazy = _import_lazy
sdk_compat.sync_message_context = _sync_message_context
direct_loader.import_address = _import_address
direct_loader.import_calldata = _import_calldata
direct_loader.import_lazy = _import_lazy
direct_vm_module.import_address_u256 = _import_address_u256
direct_vm_module.sync_message_context = _sync_message_context
wasi_mock.import_calldata = _import_calldata


def _refresh_gl_message(self) -> None:
    """Refresh message state when the loaded SDK uses the legacy layout."""
    if "genlayer.message" not in sys.modules and "genlayer.gl" not in sys.modules:
        return

    try:
        Address, u256 = _import_address_u256()
        sender = self.sender
        if sender is not None and not isinstance(sender, Address):
            sender = Address(sender if isinstance(sender, bytes) else sender.as_bytes)

        origin = self.origin
        if origin is not None and not isinstance(origin, Address):
            origin = Address(origin if isinstance(origin, bytes) else origin.as_bytes)

        _sync_message_context(
            sender_address=sender,
            origin_address=origin,
            value=u256(self._value),
            chain_id=u256(self._chain_id),
        )
    except ImportError:
        pass


direct_vm_module.VMContext._refresh_gl_message = _refresh_gl_message


def _allocate_legacy_contract(contract_cls, vm, *args, **kwargs):
    """Allocate a v0.2 contract against the RC runner's VM storage."""
    from genlayer.py.storage import ROOT_SLOT_ID
    from genlayer.py.storage._internal.generate import (
        ORIGINAL_INIT_ATTR,
        _storage_build,
    )

    type_desc = _storage_build(contract_cls, {})
    slot = vm._storage.get_store_slot(ROOT_SLOT_ID)
    instance = type_desc.get(slot, 0)

    init = getattr(getattr(type_desc, "cls", None), "__init__", None)
    if init is None:
        init = getattr(contract_cls, "__init__", None)
    if hasattr(init, ORIGINAL_INIT_ATTR):
        init = getattr(init, ORIGINAL_INIT_ATTR)
    init(instance, *args, **kwargs)
    return instance


_original_allocate_contract = direct_loader._allocate_contract


def _allocate_contract_compat(contract_cls, vm, *args, **kwargs):
    try:
        import genlayer.py.storage  # noqa: F401
    except ImportError:
        return _original_allocate_contract(contract_cls, vm, *args, **kwargs)
    return _allocate_legacy_contract(contract_cls, vm, *args, **kwargs)


direct_loader._allocate_contract = _allocate_contract_compat


_original_patch_run_nondet = direct_loader._patch_run_nondet_for_direct_mode


def _patch_legacy_run_nondet() -> None:
    """Patch the legacy vm module when the RC runner loads a v0.2 contract."""
    try:
        import genlayer.gl.vm as gl_vm
    except ImportError:
        return

    if getattr(gl_vm, "_direct_mode_patched", False):
        return

    def direct_run_nondet(leader_fn, validator_fn, /, **kwargs):
        active_vm = wasi_mock.get_vm()
        if active_vm._check_pickling:
            direct_loader._validate_pickling(leader_fn, "leader_fn")
            direct_loader._validate_pickling(validator_fn, "validator_fn")
        active_vm._in_nondet = True
        try:
            result = leader_fn()
        finally:
            active_vm._in_nondet = False
        active_vm._captured_validators.append((result, leader_fn, validator_fn))
        return result

    Lazy = _import_lazy()

    def lazy_run_nondet(leader_fn, validator_fn, /, **kwargs):
        return Lazy(lambda: direct_run_nondet(leader_fn, validator_fn, **kwargs))

    direct_run_nondet.lazy = lazy_run_nondet
    gl_vm.run_nondet = direct_run_nondet
    gl_vm._direct_mode_patched = True


def _patch_run_nondet_compat() -> None:
    _original_patch_run_nondet()
    _patch_legacy_run_nondet()


direct_loader._patch_run_nondet_for_direct_mode = _patch_run_nondet_compat


@pytest.fixture(autouse=True)
def reset_direct_contract_registry():
    """Keep direct tests isolated while adapting legacy v0.2 contracts to the v0.6 RC runner."""
    yield
    module = sys.modules.get("genlayer.gl.genvm_contracts")
    if module is not None:
        module.__known_contract__ = None


def to_hex(addr_bytes):
    """Convert address bytes to checksummed hex matching contract output.

    The contract's get_bets()/get_points() return keys via Address.as_hex,
    which produces EIP-55 checksummed hex. Call after direct_deploy so the
    SDK is on sys.path.
    """
    if hasattr(addr_bytes, "as_hex"):
        return addr_bytes.as_hex
    from genlayer.py.types import Address

    return Address(addr_bytes).as_hex
