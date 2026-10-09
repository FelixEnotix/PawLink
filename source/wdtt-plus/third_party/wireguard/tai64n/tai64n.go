/* SPDX-License-Identifier: MIT
 *
 * Copyright (C) 2017-2025 WireGuard LLC. All Rights Reserved.
 */

package tai64n

import (
	"bytes"
	"encoding/binary"
	"sync/atomic"
	"time"
)

const (
	TimestampSize = 12
	base          = uint64(0x400000000000000a)
	whitenerMask  = uint32(0x1000000 - 1)
)

type Timestamp [TimestampSize]byte

func stamp(t time.Time) Timestamp {
	var tai64n Timestamp
	secs := base + uint64(t.Unix())
	nano := uint32(t.Nanosecond()) &^ whitenerMask
	binary.BigEndian.PutUint64(tai64n[:], secs)
	binary.BigEndian.PutUint32(tai64n[8:], nano)
	return tai64n
}

// PawLink: the responder accepts a handshake only with a timestamp later than the last one it
// accepted from this peer (replay protection). A device whose clock went back - a wrong hardware
// clock, no time sync in a whitelist-only network - could then never reach a server it used before
// until its clock passed the old timestamp. The client tells how far the real time (learned from a
// trusted HTTPS answer) is ahead of the system clock; the timestamp is the later of the two.
var clockAhead atomic.Int64

// SetClockAhead sets how much the real time is ahead of the system clock (0 or less: trust the clock).
func SetClockAhead(d time.Duration) {
	if d < 0 {
		d = 0
	}
	clockAhead.Store(int64(d))
}

// ClockAhead returns the correction currently applied to handshake timestamps.
func ClockAhead() time.Duration {
	return time.Duration(clockAhead.Load())
}

func Now() Timestamp {
	return stamp(time.Now().Add(time.Duration(clockAhead.Load())))
}

func (t1 Timestamp) After(t2 Timestamp) bool {
	return bytes.Compare(t1[:], t2[:]) > 0
}

func (t Timestamp) String() string {
	return time.Unix(int64(binary.BigEndian.Uint64(t[:8])-base), int64(binary.BigEndian.Uint32(t[8:12]))).String()
}
