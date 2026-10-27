PW=$(docker inspect g06img-ledger-pg --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^POSTGRES_PASSWORD=//p'); U="postgres://ltw:$PW@g06img-ledger-pg:5432/ltw"
op() { docker run --rm --network g06img-ledger-net -e NODE_ENV=development -e DATABASE_URL=$U --entrypoint node -w /app ltw-server:0cc8d8db2411 apps/server/dist/ai/accounting/operator-cli.js "$@" 2>&1 | tail -1; }
A="--owner g06 --authorized-on 2026-10-27 --authorization-source g06-harness"
open=e2883866-39bc-43fc-a644-2b2f538de518
echo "young reservation settle:"; op image-reservation-settle --charge $open $A
psql() { docker exec g06img-ledger-pg psql -U ltw -d ltw -tAc "$1"; }
echo "columns:"; psql "select column_name from information_schema.columns where table_name='ltw_image_charges'" | tr '\n' ' '; echo
psql "insert into ltw_image_charges (charge_id,campaign_id,request_id,provider,model,reserved_micros,created_at) values ('11111111-1111-4111-8111-111111111111','c','old#0','openrouter-openai','openai/gpt-5.4-image-2',500000, now()-interval '1 hour')" 
echo "list older than 15:"; op image-reservations --older-than-minutes 15
echo "settle with charge-micros above reservation:"; op image-reservation-settle --charge 11111111-1111-4111-8111-111111111111 --charge-micros 900000 $A
echo "settle with negative:"; op image-reservation-settle --charge 11111111-1111-4111-8111-111111111111 --charge-micros -1 $A
echo "settle with 0:"; op image-reservation-settle --charge 11111111-1111-4111-8111-111111111111 --charge-micros 0 $A
echo "settle again:"; op image-reservation-settle --charge 11111111-1111-4111-8111-111111111111 $A
echo "status:"; op status
echo "append-only? update:"; psql "update ltw_image_settlements set charged_micros=0" 2>&1 | tail -1
