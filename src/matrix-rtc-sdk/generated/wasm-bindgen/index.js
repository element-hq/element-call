let wasm;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_export_3.set(idx, obj);
    return idx;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

let WASM_VECTOR_LEN = 0;

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); };

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => {
    wasm.__wbindgen_export_5.get(state.dtor)(state.a, state.b)
});

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {
        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            if (--state.cnt === 0) {
                wasm.__wbindgen_export_5.get(state.dtor)(a, state.b);
                CLOSURE_DTORS.unregister(state);
            } else {
                state.a = a;
            }
        }
    };
    real.original = state;
    CLOSURE_DTORS.register(real, state, state);
    return real;
}
/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_connectionslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_connectionslistener(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_memberships(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_memberships(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} application_type
 * @param {number} encrypted
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_open_slot(ptr, application_type, encrypted) {
    const ptr0 = passArray8ToWasm0(application_type, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_open_slot(ptr, ptr0, len0, encrypted);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_member_id(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_member_id(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} intent
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_update_application(ptr, intent) {
    const ptr0 = passArray8ToWasm0(intent, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_update_application(ptr, ptr0, len0);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_keymaplistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_keymaplistener(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_keymaplistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_keymaplistener(handle, f_status_.__wbg_ptr);
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_keymaplistener(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_keymaplistener(vtable);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} key_map
 * @param {Uint8Array} change
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_keymaplistener_on_key_map_change(ptr, key_map, change, f_status_) {
    const ptr0 = passArray8ToWasm0(key_map, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(change, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_keymaplistener_on_key_map_change(ptr, ptr0, len0, ptr1, len1, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_keyrejectedlistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_keyrejectedlistener(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_keyrejectedlistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_keyrejectedlistener(handle, f_status_.__wbg_ptr);
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_keyrejectedlistener(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_keyrejectedlistener(vtable);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} member_id
 * @param {Uint8Array} reason
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_keyrejectedlistener_on_key_rejected(ptr, member_id, reason, f_status_) {
    const ptr0 = passArray8ToWasm0(member_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(reason, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_keyrejectedlistener_on_key_rejected(ptr, ptr0, len0, ptr1, len1, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_membership(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_membership(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_transport_identity(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_own_transport_identity(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_session(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_session(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {bigint} listener
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_connections_listener(ptr, listener, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_connections_listener(ptr, listener, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} listener
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_key_map_listener(ptr, listener, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_key_map_listener(ptr, listener, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} listener
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_key_rejected_listener(ptr, listener, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_key_rejected_listener(ptr, listener, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} listener
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_memberships_listener(ptr, listener, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_memberships_listener(ptr, listener, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} listener
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_status_listener(ptr, listener, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_set_status_listener(ptr, listener, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_status(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_status(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_matrixdrivercallback(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_matrixdrivercallback(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_matrixdrivercallback(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_matrixdrivercallback(handle, f_status_.__wbg_ptr);
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_matrixdrivercallback(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_matrixdrivercallback(vtable);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} request
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_get_livekit_token(ptr, request) {
    const ptr0 = passArray8ToWasm0(request, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_get_livekit_token(ptr, ptr0, len0);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} event_type
 * @param {Uint8Array} state_key
 * @param {number} limit
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_read_events(ptr, event_type, state_key, limit) {
    const ptr0 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(state_key, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_read_events(ptr, ptr0, len0, ptr1, len1, limit);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} event_type
 * @param {Uint8Array} state_key
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_read_state(ptr, event_type, state_key) {
    const ptr0 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(state_key, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_read_state(ptr, ptr0, len0, ptr1, len1);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {bigint} sink
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_room_events(ptr, sink, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_room_events(ptr, sink, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} sink
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_to_device_events(ptr, sink, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_to_device_events(ptr, sink, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {bigint} sink
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_state_updates(ptr, sink, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_state_updates(ptr, sink, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_is_homeserver_connected(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_is_homeserver_connected(ptr, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} ptr
 * @param {bigint} sink
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_connectivity(ptr, sink, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_subscribe_connectivity(ptr, sink, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} event_type
 * @param {Uint8Array} content_json
 * @param {bigint} duration_ms
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_sticky_event(ptr, room_id, event_type, content_json, duration_ms) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_sticky_event(ptr, ptr0, len0, ptr1, len1, ptr2, len2, duration_ms);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} event_type
 * @param {Uint8Array} state_key
 * @param {Uint8Array} content_json
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_state_event(ptr, room_id, event_type, state_key, content_json) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(state_key, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_state_event(ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} event_type
 * @param {Uint8Array} content_json
 * @param {bigint} delay_ms
 * @param {Uint8Array} sticky_duration_ms
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_delayed_event(ptr, room_id, event_type, content_json, delay_ms, sticky_duration_ms) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(sticky_duration_ms, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_delayed_event(ptr, ptr0, len0, ptr1, len1, ptr2, len2, delay_ms, ptr3, len3);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} event_type
 * @param {Uint8Array} state_key
 * @param {Uint8Array} content_json
 * @param {bigint} delay_ms
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_delayed_state_event(ptr, room_id, event_type, state_key, content_json, delay_ms) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(state_key, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_delayed_state_event(ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, delay_ms);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} delay_id
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_restart_delayed_event(ptr, room_id, delay_id) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(delay_id, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_restart_delayed_event(ptr, ptr0, len0, ptr1, len1);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} delay_id
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_cancel_delayed_event(ptr, room_id, delay_id) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(delay_id, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_cancel_delayed_event(ptr, ptr0, len0, ptr1, len1);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} room_id
 * @param {Uint8Array} slot_id
 * @param {Uint8Array} member_json
 * @param {Uint8Array} delay_id
 * @param {Uint8Array} livekit_service_url
 * @param {bigint} delay_ms
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_delegate_livekit_delayed_leave(ptr, room_id, slot_id, member_json, delay_id, livekit_service_url, delay_ms) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(slot_id, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(member_json, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(delay_id, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(livekit_service_url, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_delegate_livekit_delayed_leave(ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, delay_ms);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} recipients
 * @param {Uint8Array} event_type
 * @param {Uint8Array} content_json
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_to_device(ptr, recipients, event_type, content_json) {
    const ptr0 = passArray8ToWasm0(recipients, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_send_to_device(ptr, ptr0, len0, ptr1, len1, ptr2, len2);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_get_rtc_transports(ptr) {
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_matrixdrivercallback_get_rtc_transports(ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_membershipslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_membershipslistener(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_membershipslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_membershipslistener(handle, f_status_.__wbg_ptr);
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_membershipslistener(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_membershipslistener(vtable);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} memberships
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_membershipslistener_on_memberships_change(ptr, memberships, f_status_) {
    const ptr0 = passArray8ToWasm0(memberships, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_membershipslistener_on_memberships_change(ptr, ptr0, len0, f_status_.__wbg_ptr);
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_statuslistener(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_statuslistener(vtable);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} status
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_statuslistener_on_status_change(ptr, status, f_status_) {
    const ptr0 = passArray8ToWasm0(status, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_statuslistener_on_status_change(ptr, ptr0, len0, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_todevicesink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_todevicesink(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_todevicesink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_todevicesink(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} event_type
 * @param {Uint8Array} sender
 * @param {Uint8Array} content_json
 * @param {Uint8Array} origin
 * @param {Uint8Array} sender_cross_signed
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_todevicesink_emit(ptr, event_type, sender, content_json, origin, sender_cross_signed, f_status_) {
    const ptr0 = passArray8ToWasm0(event_type, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(sender, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(content_json, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(origin, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(sender_cross_signed, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_todevicesink_emit(ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {Uint8Array} events_json
 * @param {Uint8Array} compat
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_func_compute_sessions_from_events(events_json, compat, f_status_) {
    const ptr0 = passArray8ToWasm0(events_json, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(compat, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_func_compute_sessions_from_events(ptr0, len0, ptr1, len1, f_status_.__wbg_ptr);
    var v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v3;
}

/**
 * @param {Uint8Array} impairment
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_func_impairment_severity(impairment, f_status_) {
    const ptr0 = passArray8ToWasm0(impairment, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_func_impairment_severity(ptr0, len0, f_status_.__wbg_ptr);
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_u8(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_u8(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_u8(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_u8(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_connectionslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_connectionslistener(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_roomeventsink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_roomeventsink(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_roomeventsink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_roomeventsink(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} event_json
 * @param {Uint8Array} origin
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_roomeventsink_emit(ptr, event_json, origin, f_status_) {
    const ptr0 = passArray8ToWasm0(event_json, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(origin, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_roomeventsink_emit(ptr, ptr0, len0, ptr1, len1, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_stateupdatesink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_stateupdatesink(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_stateupdatesink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_stateupdatesink(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} events_json
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_stateupdatesink_emit(ptr, events_json, f_status_) {
    const ptr0 = passArray8ToWasm0(events_json, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_stateupdatesink_emit(ptr, ptr0, len0, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_statuslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_statuslistener(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_statuslistener(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_statuslistener(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_u8(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_u8(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_u8(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_u8(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_i8(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_i8(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_i16(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_i16(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_i16(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_i16(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_u32(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_u32(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_u32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_u32(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_u32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_u32(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_u32(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_u32(handle, f_status_.__wbg_ptr);
    return ret >>> 0;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_i32(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_i32(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_i32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_i32(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_i32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_i32(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_i8(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_i8(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_i8(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_i8(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_i8(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_i8(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_u16(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_u16(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_u16(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_u16(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_u16(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_u16(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_u16(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_u16(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_i16(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_i16(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_i16(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_i16(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_i32(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_i32(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_u64(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_u64(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_u64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_u64(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_f32(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_f32(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_f64(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_f64(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_f64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_f64(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_f64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_f64(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_f64(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_f64(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_rust_buffer(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_rust_buffer(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_rust_buffer(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_rust_buffer(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_rust_buffer(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_rust_buffer(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_u64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_u64(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_u64(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_u64(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_i64(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_i64(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_i64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_i64(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_i64(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_i64(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_i64(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_i64(handle, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_f32(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_f32(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_f32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_f32(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_f32(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_f32(handle);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_rust_buffer(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_ffi_matrix_rtc_rust_future_complete_rust_buffer(handle, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} handle
 * @param {any} callback
 * @param {bigint} callback_data
 */
export function ubrn_ffi_matrix_rtc_rust_future_poll_void(handle, callback, callback_data) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_poll_void(handle, callback, callback_data);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_cancel_void(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_cancel_void(handle);
}

/**
 * @param {bigint} handle
 */
export function ubrn_ffi_matrix_rtc_rust_future_free_void(handle) {
    wasm.ubrn_ffi_matrix_rtc_rust_future_free_void(handle);
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_debug_snapshot() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_debug_snapshot();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_is_homeserver_connected() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_is_homeserver_connected();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_join() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_join();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_key_map() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_key_map();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_leave() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_leave();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_memberships() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_memberships();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_open_slot() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_open_slot();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_member_id() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_member_id();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_membership() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_membership();
    return ret;
}

/**
 * @param {any} vtable
 */
export function ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_connectionslistener(vtable) {
    wasm.ubrn_uniffi_matrix_rtc_fn_init_callback_vtable_connectionslistener(vtable);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_ffi_matrix_rtc_rust_future_complete_void(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_ffi_matrix_rtc_rust_future_complete_void(handle, f_status_.__wbg_ptr);
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_func_compute_sessions_from_events() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_func_compute_sessions_from_events();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_func_impairment_severity() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_func_impairment_severity();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_connectionslistener_on_connections_change() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_connectionslistener_on_connections_change();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_connectivitysink_emit() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_connectivitysink_emit();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_close_slot() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_close_slot();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_connection_problems() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_connection_problems();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_connections() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_connections();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_transport_identity() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_own_transport_identity();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_session() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_session();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_connections_listener() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_connections_listener();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_state_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_state_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_delayed_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_delayed_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_delayed_state_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_delayed_state_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_restart_delayed_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_restart_delayed_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_cancel_delayed_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_cancel_delayed_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_delegate_livekit_delayed_leave() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_delegate_livekit_delayed_leave();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_to_device() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_to_device();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_get_rtc_transports() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_get_rtc_transports();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_get_livekit_token() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_get_livekit_token();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_key_map_listener() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_key_map_listener();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_key_rejected_listener() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_key_rejected_listener();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_memberships_listener() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_memberships_listener();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_status_listener() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_set_status_listener();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_status() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_status();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_update_application() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_ffiparticipationmanager_update_application();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_keymaplistener_on_key_map_change() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_keymaplistener_on_key_map_change();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_keyrejectedlistener_on_key_rejected() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_keyrejectedlistener_on_key_rejected();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_sticky_event() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_send_sticky_event();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_read_events() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_read_events();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_read_state() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_read_state();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_room_events() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_room_events();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_constructor_ffimatrixdriver_new() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_constructor_ffimatrixdriver_new();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_constructor_ffiparticipationmanager_new() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_constructor_ffiparticipationmanager_new();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_ffi_matrix_rtc_uniffi_contract_version() {
    const ret = wasm.ubrn_ffi_matrix_rtc_uniffi_contract_version();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_to_device_events() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_to_device_events();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_state_updates() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_state_updates();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_is_homeserver_connected() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_is_homeserver_connected();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_connectivity() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_matrixdrivercallback_subscribe_connectivity();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_membershipslistener_on_memberships_change() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_membershipslistener_on_memberships_change();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_roomeventsink_emit() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_roomeventsink_emit();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_stateupdatesink_emit() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_stateupdatesink_emit();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_statuslistener_on_status_change() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_statuslistener_on_status_change();
    return ret;
}

/**
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_checksum_method_todevicesink_emit() {
    const ret = wasm.ubrn_uniffi_matrix_rtc_checksum_method_todevicesink_emit();
    return ret;
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} connections
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_method_connectionslistener_on_connections_change(ptr, connections, f_status_) {
    const ptr0 = passArray8ToWasm0(connections, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_method_connectionslistener_on_connections_change(ptr, ptr0, len0, f_status_.__wbg_ptr);
}

/**
 * @param {Uint8Array} room_id
 * @param {Uint8Array} slot_id
 * @param {Uint8Array} user_id
 * @param {Uint8Array} device_id
 * @param {bigint} driver
 * @param {Uint8Array} config
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_constructor_ffiparticipationmanager_new(room_id, slot_id, user_id, device_id, driver, config, f_status_) {
    const ptr0 = passArray8ToWasm0(room_id, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(slot_id, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray8ToWasm0(user_id, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArray8ToWasm0(device_id, wasm.__wbindgen_malloc);
    const len3 = WASM_VECTOR_LEN;
    const ptr4 = passArray8ToWasm0(config, wasm.__wbindgen_malloc);
    const len4 = WASM_VECTOR_LEN;
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_constructor_ffiparticipationmanager_new(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, driver, ptr4, len4, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_close_slot(ptr) {
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_close_slot(ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_connection_problems(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_connection_problems(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_connections(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_connections(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_debug_snapshot(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_debug_snapshot(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_is_homeserver_connected(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_is_homeserver_connected(ptr, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} intent
 * @param {Uint8Array} params
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_join(ptr, intent, params) {
    const ptr0 = passArray8ToWasm0(intent, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(params, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_join(ptr, ptr0, len0, ptr1, len1);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} ptr
 * @param {RustCallStatus} f_status_
 * @returns {Uint8Array}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_key_map(ptr, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_key_map(ptr, f_status_.__wbg_ptr);
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * @param {bigint} ptr
 * @param {Uint8Array} code
 * @param {Uint8Array} reason
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_leave(ptr, code, reason) {
    const ptr0 = passArray8ToWasm0(code, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(reason, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_ffiparticipationmanager_leave(ptr, ptr0, len0, ptr1, len1);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_connectivitysink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_connectivitysink(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_connectivitysink(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_connectivitysink(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} ptr
 * @param {number} connected
 * @param {RustCallStatus} f_status_
 * @returns {number}
 */
export function ubrn_uniffi_matrix_rtc_fn_method_connectivitysink_emit(ptr, connected, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_method_connectivitysink_emit(ptr, connected, f_status_.__wbg_ptr);
    return ret;
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_ffimatrixdriver(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_ffimatrixdriver(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_ffimatrixdriver(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_ffimatrixdriver(handle, f_status_.__wbg_ptr);
}

/**
 * @param {bigint} callback
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_constructor_ffimatrixdriver_new(callback, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_constructor_ffimatrixdriver_new(callback, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 * @returns {bigint}
 */
export function ubrn_uniffi_matrix_rtc_fn_clone_ffiparticipationmanager(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    const ret = wasm.ubrn_uniffi_matrix_rtc_fn_clone_ffiparticipationmanager(handle, f_status_.__wbg_ptr);
    return BigInt.asUintN(64, ret);
}

/**
 * @param {bigint} handle
 * @param {RustCallStatus} f_status_
 */
export function ubrn_uniffi_matrix_rtc_fn_free_ffiparticipationmanager(handle, f_status_) {
    _assertClass(f_status_, RustCallStatus);
    wasm.ubrn_uniffi_matrix_rtc_fn_free_ffiparticipationmanager(handle, f_status_.__wbg_ptr);
}

function __wbg_adapter_24(arg0, arg1) {
    wasm._dyn_core_e48f7a02345547b9___ops__function__FnMut_____Output______as_wasm_bindgen_65e498d0bf4959ae___closure__WasmClosure___describe__invoke______(arg0, arg1);
}

function __wbg_adapter_27(arg0, arg1, arg2) {
    wasm.closure531_externref_shim(arg0, arg1, arg2);
}

const ForeignFutureCompleteF32Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletef32_free(ptr >>> 0, 1));

export class ForeignFutureCompleteF32 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteF32Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletef32_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteF32} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteF32);
        wasm.foreignfuturecompletef32_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteF64Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletef64_free(ptr >>> 0, 1));

export class ForeignFutureCompleteF64 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteF64Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletef64_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteF64} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteF64);
        wasm.foreignfuturecompletef64_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteI16Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletei16_free(ptr >>> 0, 1));

export class ForeignFutureCompleteI16 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteI16Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletei16_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteI16} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteI16);
        wasm.foreignfuturecompletei16_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteI32Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletei32_free(ptr >>> 0, 1));

export class ForeignFutureCompleteI32 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteI32Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletei32_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteI32} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteI32);
        wasm.foreignfuturecompletei32_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteI64Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletei64_free(ptr >>> 0, 1));

export class ForeignFutureCompleteI64 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteI64Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletei64_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteI64} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteI64);
        wasm.foreignfuturecompletei64_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteI8Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletei8_free(ptr >>> 0, 1));

export class ForeignFutureCompleteI8 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteI8Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletei8_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteI8} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteI8);
        wasm.foreignfuturecompletei8_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteRustBufferFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompleterustbuffer_free(ptr >>> 0, 1));

export class ForeignFutureCompleteRustBuffer {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ForeignFutureCompleteRustBuffer.prototype);
        obj.__wbg_ptr = ptr;
        ForeignFutureCompleteRustBufferFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteRustBufferFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompleterustbuffer_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteRustBuffer} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteRustBuffer);
        wasm.foreignfuturecompleterustbuffer_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteU16Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompleteu16_free(ptr >>> 0, 1));

export class ForeignFutureCompleteU16 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteU16Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompleteu16_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteU16} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteU16);
        wasm.foreignfuturecompleteu16_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteU32Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompleteu32_free(ptr >>> 0, 1));

export class ForeignFutureCompleteU32 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteU32Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompleteu32_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteU32} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteU32);
        wasm.foreignfuturecompleteu32_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteU64Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompleteu64_free(ptr >>> 0, 1));

export class ForeignFutureCompleteU64 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteU64Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompleteu64_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteU64} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteU64);
        wasm.foreignfuturecompleteu64_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteU8Finalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompleteu8_free(ptr >>> 0, 1));

export class ForeignFutureCompleteU8 {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteU8Finalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompleteu8_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteU8} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteU8);
        wasm.foreignfuturecompleteu8_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const ForeignFutureCompleteVoidFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_foreignfuturecompletevoid_free(ptr >>> 0, 1));

export class ForeignFutureCompleteVoid {

    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(ForeignFutureCompleteVoid.prototype);
        obj.__wbg_ptr = ptr;
        ForeignFutureCompleteVoidFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ForeignFutureCompleteVoidFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_foreignfuturecompletevoid_free(ptr, 0);
    }
    /**
     * @param {ForeignFutureCompleteVoid} _ctx
     * @param {bigint} callback_data
     * @param {any} result
     */
    call(_ctx, callback_data, result) {
        _assertClass(_ctx, ForeignFutureCompleteVoid);
        wasm.foreignfuturecompletevoid_call(this.__wbg_ptr, _ctx.__wbg_ptr, callback_data, result);
    }
}

const RustCallStatusFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_rustcallstatus_free(ptr >>> 0, 1));

export class RustCallStatus {

    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RustCallStatusFinalization.unregister(this);
        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_rustcallstatus_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get code() {
        const ret = wasm.__wbg_get_rustcallstatus_code(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set code(arg0) {
        wasm.__wbg_set_rustcallstatus_code(this.__wbg_ptr, arg0);
    }
    /**
     * @param {Uint8Array | null} [bytes]
     */
    set errorBuf(bytes) {
        var ptr0 = isLikeNone(bytes) ? 0 : passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        wasm.rustcallstatus_set_error_buf(this.__wbg_ptr, ptr0, len0);
    }
    constructor() {
        const ret = wasm.rustcallstatus_new();
        this.__wbg_ptr = ret >>> 0;
        RustCallStatusFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {Uint8Array | undefined}
     */
    get errorBuf() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.rustcallstatus_error_buf(ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = arg0.buffer;
        return ret;
    };
    imports.wbg.__wbg_call_0056921d632def66 = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_00ed0f3262ca10fc = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_02529374d31ad97c = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_0433755a93443d6e = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), BigInt.asUintN(64, arg3));
        return ret;
    };
    imports.wbg.__wbg_call_05dc34bdb8662702 = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), BigInt.asUintN(64, arg3));
        return ret;
    };
    imports.wbg.__wbg_call_0ba4077697ab1405 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, ForeignFutureCompleteRustBuffer.__wrap(arg9), BigInt.asUintN(64, arg10));
        return ret;
    };
    imports.wbg.__wbg_call_21960420ca81bc05 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        var v3 = getArrayU8FromWasm0(arg9, arg10).slice();
        wasm.__wbindgen_free(arg9, arg10 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, v3, ForeignFutureCompleteRustBuffer.__wrap(arg11), BigInt.asUintN(64, arg12));
        return ret;
    };
    imports.wbg.__wbg_call_2798409ff618ef7d = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_2f24f710f0dd8d10 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1);
        return ret;
    };
    imports.wbg.__wbg_call_4022622bc30aaf84 = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_45ca295cb4469524 = function(arg0, arg1, arg2, arg3) {
        arg0.call(arg1, BigInt.asUintN(64, arg2), arg3);
    };
    imports.wbg.__wbg_call_45f35e4128d6c004 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, ForeignFutureCompleteRustBuffer.__wrap(arg5), BigInt.asUintN(64, arg6));
        return ret;
    };
    imports.wbg.__wbg_call_4614c0a573de577f = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12, arg13) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        var v3 = getArrayU8FromWasm0(arg9, arg10).slice();
        wasm.__wbindgen_free(arg9, arg10 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, v3, BigInt.asUintN(64, arg11), ForeignFutureCompleteRustBuffer.__wrap(arg12), BigInt.asUintN(64, arg13));
        return ret;
    };
    imports.wbg.__wbg_call_496b92421c092b65 = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_571d4611879307e7 = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), BigInt.asUintN(64, arg3));
        return ret;
    };
    imports.wbg.__wbg_call_65221d24e12159bf = function(arg0, arg1, arg2, arg3, arg4) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), ForeignFutureCompleteRustBuffer.__wrap(arg3), BigInt.asUintN(64, arg4));
        return ret;
    };
    imports.wbg.__wbg_call_65360e4d1b0f41fa = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_672a4d21634d4a24 = function() { return handleError(function (arg0, arg1) {
        const ret = arg0.call(arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_67bcb4b184601516 = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_79e16370d6861b4f = function(arg0, arg1, arg2, arg3, arg4) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0);
        return ret;
    };
    imports.wbg.__wbg_call_7cccdd69e0791ae2 = function() { return handleError(function (arg0, arg1, arg2) {
        const ret = arg0.call(arg1, arg2);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_call_85dc743acd81f8e1 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12, arg13, arg14, arg15) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        var v3 = getArrayU8FromWasm0(arg9, arg10).slice();
        wasm.__wbindgen_free(arg9, arg10 * 1, 1);
        var v4 = getArrayU8FromWasm0(arg11, arg12).slice();
        wasm.__wbindgen_free(arg11, arg12 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, v3, v4, BigInt.asUintN(64, arg13), ForeignFutureCompleteVoid.__wrap(arg14), BigInt.asUintN(64, arg15));
        return ret;
    };
    imports.wbg.__wbg_call_9a894f10d06a53c9 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, ForeignFutureCompleteVoid.__wrap(arg7), BigInt.asUintN(64, arg8));
        return ret;
    };
    imports.wbg.__wbg_call_9f7a841426436a44 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, ForeignFutureCompleteVoid.__wrap(arg7), BigInt.asUintN(64, arg8));
        return ret;
    };
    imports.wbg.__wbg_call_a6145cafbb6c59f0 = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_a79f116fab0f1a0a = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1);
        return ret;
    };
    imports.wbg.__wbg_call_abeb9928262c69b8 = function(arg0, arg1, arg2, arg3, arg4) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0);
        return ret;
    };
    imports.wbg.__wbg_call_b66d526ecf55c81d = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_bd883beab9425b7c = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, arg7 >>> 0, ForeignFutureCompleteRustBuffer.__wrap(arg8), BigInt.asUintN(64, arg9));
        return ret;
    };
    imports.wbg.__wbg_call_c9c4e766b640b52d = function(arg0, arg1, arg2, arg3) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), BigInt.asUintN(64, arg3));
        return ret;
    };
    imports.wbg.__wbg_call_ca06027b14b17766 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11, arg12, arg13) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        var v3 = getArrayU8FromWasm0(arg10, arg11).slice();
        wasm.__wbindgen_free(arg10, arg11 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, BigInt.asUintN(64, arg9), v3, ForeignFutureCompleteRustBuffer.__wrap(arg12), BigInt.asUintN(64, arg13));
        return ret;
    };
    imports.wbg.__wbg_call_db19d6a7a08fbd37 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8, arg9, arg10, arg11) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        var v2 = getArrayU8FromWasm0(arg7, arg8).slice();
        wasm.__wbindgen_free(arg7, arg8 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, v2, BigInt.asUintN(64, arg9), ForeignFutureCompleteRustBuffer.__wrap(arg10), BigInt.asUintN(64, arg11));
        return ret;
    };
    imports.wbg.__wbg_call_dd8fc90cc1eed1a0 = function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        var v1 = getArrayU8FromWasm0(arg5, arg6).slice();
        wasm.__wbindgen_free(arg5, arg6 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0, v1, ForeignFutureCompleteRustBuffer.__wrap(arg7), BigInt.asUintN(64, arg8));
        return ret;
    };
    imports.wbg.__wbg_call_df53672c5883e9e7 = function(arg0, arg1, arg2, arg3, arg4) {
        var v0 = getArrayU8FromWasm0(arg3, arg4).slice();
        wasm.__wbindgen_free(arg3, arg4 * 1, 1);
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2), v0);
        return ret;
    };
    imports.wbg.__wbg_call_f95ee156aae25631 = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_fb7f89f8d567b160 = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_call_fedc2bfb0eb6df90 = function(arg0, arg1, arg2) {
        arg0.call(arg1, BigInt.asUintN(64, arg2));
    };
    imports.wbg.__wbg_call_ff7e7c3b656ecebf = function(arg0, arg1, arg2) {
        const ret = arg0.call(arg1, BigInt.asUintN(64, arg2));
        return ret;
    };
    imports.wbg.__wbg_callstatus_ab813cdd9fb59b5c = function(arg0) {
        const ret = arg0.call_status;
        _assertClass(ret, RustCallStatus);
        var ptr1 = ret.__destroy_into_raw();
        return ptr1;
    };
    imports.wbg.__wbg_canceldelayedevent_f1442079ae4bb697 = function(arg0) {
        const ret = arg0.cancel_delayed_event;
        return ret;
    };
    imports.wbg.__wbg_clearTimeout_5a54f8841c30079a = function(arg0) {
        const ret = clearTimeout(arg0);
        return ret;
    };
    imports.wbg.__wbg_code_a1790f546af56cdc = function(arg0) {
        const ret = arg0.code;
        return ret;
    };
    imports.wbg.__wbg_code_b18c52258a7d4327 = function(arg0) {
        const ret = arg0.code;
        return ret;
    };
    imports.wbg.__wbg_crypto_86f2631e91b51511 = function(arg0) {
        const ret = arg0.crypto;
        return ret;
    };
    imports.wbg.__wbg_delegatelivekitdelayedleave_991fce363b53064f = function(arg0) {
        const ret = arg0.delegate_livekit_delayed_leave;
        return ret;
    };
    imports.wbg.__wbg_errorbuf_59fafcd45c02f900 = function(arg0, arg1) {
        const ret = arg1.errorBuf;
        var ptr1 = isLikeNone(ret) ? 0 : passArray8ToWasm0(ret, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_errorbuf_9e8687be915296d2 = function(arg0, arg1) {
        const ret = arg1.errorBuf;
        var ptr1 = isLikeNone(ret) ? 0 : passArray8ToWasm0(ret, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_free_b85a6024660bd07c = function(arg0) {
        const ret = arg0.free;
        return ret;
    };
    imports.wbg.__wbg_getRandomValues_b3f15fcbfabb0f8b = function() { return handleError(function (arg0, arg1) {
        arg0.getRandomValues(arg1);
    }, arguments) };
    imports.wbg.__wbg_getlivekittoken_269ca0b4c594770a = function(arg0) {
        const ret = arg0.get_livekit_token;
        return ret;
    };
    imports.wbg.__wbg_getrtctransports_8be200fadbe143dc = function(arg0) {
        const ret = arg0.get_rtc_transports;
        return ret;
    };
    imports.wbg.__wbg_handle_c2870606e589531b = function(arg0) {
        const ret = arg0.handle;
        return ret;
    };
    imports.wbg.__wbg_ishomeserverconnected_dc5057f7242a591e = function(arg0) {
        const ret = arg0.is_homeserver_connected;
        return ret;
    };
    imports.wbg.__wbg_msCrypto_d562bbe83e0d4b91 = function(arg0) {
        const ret = arg0.msCrypto;
        return ret;
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(arg0);
        return ret;
    };
    imports.wbg.__wbg_newnoargs_105ed471475aaf50 = function(arg0, arg1) {
        const ret = new Function(getStringFromWasm0(arg0, arg1));
        return ret;
    };
    imports.wbg.__wbg_newwithbyteoffsetandlength_d97e637ebe145a9a = function(arg0, arg1, arg2) {
        const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_newwithlength_a381634e90c276d4 = function(arg0) {
        const ret = new Uint8Array(arg0 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_node_e1f24f89a7336c2e = function(arg0) {
        const ret = arg0.node;
        return ret;
    };
    imports.wbg.__wbg_now_807e54c39636c349 = function() {
        const ret = Date.now();
        return ret;
    };
    imports.wbg.__wbg_onconnectionschange_cb540732b536bde5 = function(arg0) {
        const ret = arg0.on_connections_change;
        return ret;
    };
    imports.wbg.__wbg_onkeymapchange_7af99be63015699f = function(arg0) {
        const ret = arg0.on_key_map_change;
        return ret;
    };
    imports.wbg.__wbg_onkeyrejected_0811c486ecda07ea = function(arg0) {
        const ret = arg0.on_key_rejected;
        return ret;
    };
    imports.wbg.__wbg_onmembershipschange_72a01e47629908a2 = function(arg0) {
        const ret = arg0.on_memberships_change;
        return ret;
    };
    imports.wbg.__wbg_onstatuschange_926e83644f91f32d = function(arg0) {
        const ret = arg0.on_status_change;
        return ret;
    };
    imports.wbg.__wbg_pointee_26637032edb8983c = function(arg0) {
        const ret = arg0.pointee;
        return isLikeNone(ret) ? 0xFFFFFF : ret;
    };
    imports.wbg.__wbg_process_3975fd6c72f520aa = function(arg0) {
        const ret = arg0.process;
        return ret;
    };
    imports.wbg.__wbg_queueMicrotask_97d92b4fcc8a61c5 = function(arg0) {
        queueMicrotask(arg0);
    };
    imports.wbg.__wbg_queueMicrotask_d3219def82552485 = function(arg0) {
        const ret = arg0.queueMicrotask;
        return ret;
    };
    imports.wbg.__wbg_randomFillSync_f8c153b79f285817 = function() { return handleError(function (arg0, arg1) {
        arg0.randomFillSync(arg1);
    }, arguments) };
    imports.wbg.__wbg_readevents_98385cdfe47bdeee = function(arg0) {
        const ret = arg0.read_events;
        return ret;
    };
    imports.wbg.__wbg_readstate_a52da7153b66ed2b = function(arg0) {
        const ret = arg0.read_state;
        return ret;
    };
    imports.wbg.__wbg_require_b74f47fc2d022fd6 = function() { return handleError(function () {
        const ret = module.require;
        return ret;
    }, arguments) };
    imports.wbg.__wbg_resolve_4851785c9c5f573d = function(arg0) {
        const ret = Promise.resolve(arg0);
        return ret;
    };
    imports.wbg.__wbg_restartdelayedevent_0d0c2a4a4627841f = function(arg0) {
        const ret = arg0.restart_delayed_event;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_03774948f0205329 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_21195623004109c3 = function(arg0, arg1) {
        const ret = arg1.return_value;
        const ptr1 = passArray8ToWasm0(ret, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_returnvalue_2620087eeddb8b84 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_38e0584d82a3ca2e = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_3e9d3c06adc527d8 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_6e396db732507afb = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_7debfc20c2457c0f = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_92b4f6af41751b5a = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_a10e08181b6e3347 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_b2583433f7d5bc58 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_returnvalue_fe6442da8edb6e26 = function(arg0) {
        const ret = arg0.return_value;
        return ret;
    };
    imports.wbg.__wbg_senddelayedevent_1a17e9af52ac70ce = function(arg0) {
        const ret = arg0.send_delayed_event;
        return ret;
    };
    imports.wbg.__wbg_senddelayedstateevent_7310e92bccc3dd9a = function(arg0) {
        const ret = arg0.send_delayed_state_event;
        return ret;
    };
    imports.wbg.__wbg_sendstateevent_b46311c2c989f673 = function(arg0) {
        const ret = arg0.send_state_event;
        return ret;
    };
    imports.wbg.__wbg_sendstickyevent_ae6f44183a0c7825 = function(arg0) {
        const ret = arg0.send_sticky_event;
        return ret;
    };
    imports.wbg.__wbg_sendtodevice_a3e33fb31230ba64 = function(arg0) {
        const ret = arg0.send_to_device;
        return ret;
    };
    imports.wbg.__wbg_setTimeout_db2dbaeefb6f39c7 = function() { return handleError(function (arg0, arg1) {
        const ret = setTimeout(arg0, arg1);
        return ret;
    }, arguments) };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        arg0.set(arg1, arg2 >>> 0);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_88a902d13a557d07 = function() {
        const ret = typeof global === 'undefined' ? null : global;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_GLOBAL_THIS_56578be7e9f832b0 = function() {
        const ret = typeof globalThis === 'undefined' ? null : globalThis;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_SELF_37c5d418e4bf5819 = function() {
        const ret = typeof self === 'undefined' ? null : self;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_static_accessor_WINDOW_5de37043a91a9c40 = function() {
        const ret = typeof window === 'undefined' ? null : window;
        return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
    };
    imports.wbg.__wbg_subarray_aa9065fa9dc5df96 = function(arg0, arg1, arg2) {
        const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
        return ret;
    };
    imports.wbg.__wbg_subscribeconnectivity_a75e094330a03e3e = function(arg0) {
        const ret = arg0.subscribe_connectivity;
        return ret;
    };
    imports.wbg.__wbg_subscriberoomevents_2e4d5ca6372fe4cd = function(arg0) {
        const ret = arg0.subscribe_room_events;
        return ret;
    };
    imports.wbg.__wbg_subscribestateupdates_06939632cde2db00 = function(arg0) {
        const ret = arg0.subscribe_state_updates;
        return ret;
    };
    imports.wbg.__wbg_subscribetodeviceevents_afcc4eb08f3d890c = function(arg0) {
        const ret = arg0.subscribe_to_device_events;
        return ret;
    };
    imports.wbg.__wbg_then_44b73946d2fb3e7d = function(arg0, arg1) {
        const ret = arg0.then(arg1);
        return ret;
    };
    imports.wbg.__wbg_unifficlone_25a64f9a81fb5b28 = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_unifficlone_6471a1309ee8fc26 = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_unifficlone_95a28cf009142cf6 = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_unifficlone_9de5c992227b473d = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_unifficlone_f4e9653dc2b93c0c = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_unifficlone_fe0240768db0e3d6 = function(arg0) {
        const ret = arg0.uniffi_clone;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_00c9e670fc140d79 = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_2b26526e84ac127f = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_313a3d469f2be86d = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_7f877a9bb1d1f761 = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_af6c094a1e08186f = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_uniffifree_c315e1fbfd7f9e6a = function(arg0) {
        const ret = arg0.uniffi_free;
        return ret;
    };
    imports.wbg.__wbg_versions_4e31226f5e8dc909 = function(arg0) {
        const ret = arg0.versions;
        return ret;
    };
    imports.wbg.__wbindgen_cb_drop = function(arg0) {
        const obj = arg0.original;
        if (obj.cnt-- == 1) {
            obj.a = 0;
            return true;
        }
        const ret = false;
        return ret;
    };
    imports.wbg.__wbindgen_closure_wrapper2151 = function(arg0, arg1, arg2) {
        const ret = makeMutClosure(arg0, arg1, 520, __wbg_adapter_24);
        return ret;
    };
    imports.wbg.__wbindgen_closure_wrapper2175 = function(arg0, arg1, arg2) {
        const ret = makeMutClosure(arg0, arg1, 532, __wbg_adapter_27);
        return ret;
    };
    imports.wbg.__wbindgen_init_externref_table = function() {
        const table = wasm.__wbindgen_export_3;
        const offset = table.grow(4);
        table.set(0, undefined);
        table.set(offset + 0, undefined);
        table.set(offset + 1, null);
        table.set(offset + 2, true);
        table.set(offset + 3, false);
        ;
    };
    imports.wbg.__wbindgen_is_function = function(arg0) {
        const ret = typeof(arg0) === 'function';
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = arg0;
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_string = function(arg0) {
        const ret = typeof(arg0) === 'string';
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = arg0 === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return ret;
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return ret;
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_init_memory(imports, memory) {

}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();

    __wbg_init_memory(imports);

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }


    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    __wbg_init_memory(imports);

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync };
export default __wbg_init;
