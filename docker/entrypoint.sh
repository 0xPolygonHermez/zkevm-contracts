#!/usr/bin/env sh

set -xeuo

nginx -g 'daemon off;' &

geth "$@"
