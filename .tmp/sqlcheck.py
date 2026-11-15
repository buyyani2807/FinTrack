import sys
from pglast import parse_sql
from pglast.parser import parse_plpgsql_json

for path in sys.argv[1:]:
    src = open(path).read()
    raw = src.encode()
    stmts = parse_sql(src)
    print(path, "statements:", len(stmts))
    for s in stmts:
        node = s.stmt
        if type(node).__name__ != "CreateFunctionStmt":
            continue
        text = src[s.stmt_location:s.stmt_location + s.stmt_len]
        name = node.funcname[-1].sval
        lang = [o.arg.sval for o in (node.options or []) if o.defname == "language"]
        if lang and lang[0] != "plpgsql":
            print("  sql ", name)
            continue
        try:
            parse_plpgsql_json(text + ";")
            print("  ok  ", name)
        except Exception as e:
            print("  FAIL", name, e)
