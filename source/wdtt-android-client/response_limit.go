package main

import (
	"fmt"
	"io"
)

const maxNativeResponseBytes = 8 << 20

func readResponseBounded(reader io.Reader) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, maxNativeResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxNativeResponseBytes {
		return nil, fmt.Errorf("ответ сервиса слишком большой")
	}
	return body, nil
}
