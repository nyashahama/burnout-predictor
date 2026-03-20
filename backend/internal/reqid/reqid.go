// Package reqid provides request ID storage and retrieval via context.
package reqid

import "context"

type keyType struct{}

var key keyType

// Set returns a new context with the given request ID stored.
func Set(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, key, id)
}

// FromCtx returns the request ID stored in ctx, or an empty string if not set.
func FromCtx(ctx context.Context) string {
	id, _ := ctx.Value(key).(string)
	return id
}
