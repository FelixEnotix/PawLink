package main

import "sync"

// Lock-free hits; serialized FIFO insertion bounds retained keys without
// adding a lock or an allocation to every encrypted packet.
type boundedCache struct {
	values   sync.Map
	mu       sync.Mutex
	keys     []string
	capacity int
	next     int
}

func newBoundedCache(capacity int) *boundedCache {
	if capacity < 1 {
		panic("cache capacity must be positive")
	}
	return &boundedCache{capacity: capacity, keys: make([]string, 0, capacity)}
}

func (cache *boundedCache) Load(key string) (any, bool) { return cache.values.Load(key) }
func (cache *boundedCache) Delete(key string)           { cache.values.Delete(key) }
func (cache *boundedCache) Store(key string, value any) {
	cache.mu.Lock()
	defer cache.mu.Unlock()
	if _, exists := cache.values.Load(key); exists {
		cache.values.Store(key, value)
		return
	}
	if len(cache.keys) < cache.capacity {
		cache.keys = append(cache.keys, key)
	} else {
		cache.values.Delete(cache.keys[cache.next])
		cache.keys[cache.next] = key
		cache.next = (cache.next + 1) % cache.capacity
	}
	cache.values.Store(key, value)
}
