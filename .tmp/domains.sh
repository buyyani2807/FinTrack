rdap() {
  case "$1" in
    *.co.in|*.in) echo "https://rdap.nixiregistry.in/rdap/domain/$1" ;;
    *.com) echo "https://rdap.verisign.com/com/v1/domain/$1" ;;
    *.app) echo "https://pubapi.registry.google/rdap/domain/$1" ;;
    *) echo "https://rdap.identitydigital.services/rdap/domain/$1" ;;
  esac
}
for d in fintrack.in fintrack.co.in fintrack.ai fintrack.money fintrack.finance \
  getfintrack.com getfintrack.in getfintrack.ai usefintrack.com usefintrack.in \
  fintrackapp.com fintrackapp.in fintrackapp.ai fintrackhq.com fintrackhq.in \
  fintrackindia.com fintrackindia.in fintrack.app myfintrack.in fintrackbooks.com fintrackbooks.in; do
  code=$(curl -s -m 15 -o /tmp/rd.json -w "%{http_code}" "$(rdap $d)")
  ns=$(dig +short NS "$d" | tr '\n' ' ')
  if [ "$code" = "404" ]; then st="AVAILABLE (not registered)"; elif [ "$code" = "200" ]; then reg=$(python3 -c "import json;d=json.load(open('/tmp/rd.json'));print(next((e['eventDate'][:10] for e in d.get('events',[]) if e['eventAction']=='registration'),'?'))" 2>/dev/null); st="taken (registered $reg)"; else st="unknown (lookup $code)"; fi
  printf "%-22s %-32s %s\n" "$d" "$st" "$ns"
done
