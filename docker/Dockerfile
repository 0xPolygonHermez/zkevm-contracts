FROM ethereum/client-go:v1.12.0

RUN apk update
RUN apk add --no-cache nginx

RUN nginx -v

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY docker/nginx.conf /etc/nginx/nginx.conf

EXPOSE 8545
EXPOSE 9545

COPY docker/gethData /
COPY docker/deploymentOutput /config/

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

CMD ["--rpc.allow-unprotected-txs", "--http", "--http.addr", "0.0.0.0", "--http.corsdomain", "*", "--http.vhosts", "*", "--ws", "--ws.origins", "*", "--ws.addr", "0.0.0.0", "--dev", "--dev.period", "1", "--datadir", "/geth_data"]
