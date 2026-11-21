package main

import (
	caddycmd "github.com/caddyserver/caddy/v2/cmd"

	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp"
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/headers"
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/reverseproxy"
	// forward_auth lives in its own package. Importing reverseproxy does not register it.
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/reverseproxy/forwardauth"
	_ "github.com/caddyserver/caddy/v2/modules/caddyhttp/rewrite"
)

func main() {
	caddycmd.Main()
}
