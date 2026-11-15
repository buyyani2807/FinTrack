import zipfile, os
here = os.path.dirname(os.path.abspath(__file__))

tally = """<ENVELOPE>
 <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 <BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC><REQUESTDATA>
  <TALLYMESSAGE xmlns:UDF="TallyUDF"><GROUP NAME="Debtors - Bengaluru" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT></GROUP></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Mohan Electricals" RESERVEDNAME=""><PARENT>Debtors - Bengaluru</PARENT><PARTYGSTIN>29ABCDE1234F1Z5</PARTYGSTIN><LEDGERMOBILE>98450 12345</LEDGERMOBILE><LEDSTATENAME>Karnataka</LEDSTATENAME><OPENINGBALANCE>-45000.00</OPENINGBALANCE><NAME.LIST><NAME>Mohan Electricals</NAME></NAME.LIST></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="M/s Mohan Electricals Pvt Ltd" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT><LEDGERMOBILE>+91 9845012345</LEDGERMOBILE><OPENINGBALANCE>-5000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Sharma Kirana &amp; Sons" RESERVEDNAME=""><PARENT>Sundry Debtors</PARENT><OPENINGBALANCE>-12500.50</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Havells India Ltd" RESERVEDNAME=""><PARENT>Sundry Creditors</PARENT><OPENINGBALANCE>80000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="HDFC Bank A/c" RESERVEDNAME=""><PARENT>Bank Accounts</PARENT><OPENINGBALANCE>-150000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Cash" RESERVEDNAME=""><PARENT>Cash-in-Hand</PARENT><OPENINGBALANCE>-20000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Sales @ 18%" RESERVEDNAME=""><PARENT>Sales Accounts</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Purchase @ 18%" RESERVEDNAME=""><PARENT>Purchase Accounts</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Output CGST" RESERVEDNAME=""><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Output SGST" RESERVEDNAME=""><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="CGST" RESERVEDNAME=""><PARENT>Duties &amp; Taxes</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Freight Charges" RESERVEDNAME=""><PARENT>Indirect Expenses</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Shop Rent" RESERVEDNAME=""><PARENT>Indirect Expenses</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Ramesh Capital A/c" RESERVEDNAME=""><PARENT>Capital Account</PARENT><OPENINGBALANCE>182500.50</OPENINGBALANCE></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Suspense" RESERVEDNAME=""><PARENT>Suspense A/c</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><LEDGER NAME="Misc Head" RESERVEDNAME=""><PARENT>Weird Group</PARENT></LEDGER></TALLYMESSAGE>
  <TALLYMESSAGE><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>20260415</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>S-101</VOUCHERNUMBER><PARTYLEDGERNAME>Mohan Electricals</PARTYLEDGERNAME><NARRATION>Wires &amp; switches</NARRATION>
    <ALLINVENTORYENTRIES.LIST><STOCKITEMNAME>Wire 1.5mm</STOCKITEMNAME><AMOUNT>10000.00</AMOUNT><ACCOUNTINGALLOCATIONS.LIST><LEDGERNAME>Sales @ 18%</LEDGERNAME><AMOUNT>10000.00</AMOUNT></ACCOUNTINGALLOCATIONS.LIST></ALLINVENTORYENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Mohan Electricals</LEDGERNAME><ISPARTYLEDGER>Yes</ISPARTYLEDGER><AMOUNT>-11800.00</AMOUNT><BILLALLOCATIONS.LIST><NAME>S-101</NAME><AMOUNT>-11800.00</AMOUNT></BILLALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output CGST</LEDGERNAME><AMOUNT>900.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Output SGST</LEDGERNAME><AMOUNT>900.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  </VOUCHER></TALLYMESSAGE>
  <TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><DATE>20260420</DATE><VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME><VOUCHERNUMBER>R-1</VOUCHERNUMBER><PARTYLEDGERNAME>Sharma Kirana &amp; Sons</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Sharma Kirana &amp; Sons</LEDGERNAME><AMOUNT>5000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>HDFC Bank A/c</LEDGERNAME><AMOUNT>-5000.00</AMOUNT><BANKALLOCATIONS.LIST><AMOUNT>-5000.00</AMOUNT></BANKALLOCATIONS.LIST></ALLLEDGERENTRIES.LIST>
  </VOUCHER></TALLYMESSAGE>
  <TALLYMESSAGE><VOUCHER VCHTYPE="Payment"><DATE>20260501</DATE><VOUCHERTYPENAME>Payment</VOUCHERTYPENAME><VOUCHERNUMBER>P-1</VOUCHERNUMBER>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Shop Rent</LEDGERNAME><AMOUNT>-25000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>25000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  </VOUCHER></TALLYMESSAGE>
  <TALLYMESSAGE><VOUCHER VCHTYPE="Journal"><DATE>20260502</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>J-1</VOUCHERNUMBER><ISCANCELLED>Yes</ISCANCELLED>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Shop Rent</LEDGERNAME><AMOUNT>-1.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Cash</LEDGERNAME><AMOUNT>1.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  </VOUCHER></TALLYMESSAGE>
  <TALLYMESSAGE><VOUCHER VCHTYPE="Purchase"><DATE>20260503</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>H-77</VOUCHERNUMBER><PARTYLEDGERNAME>Havells India Ltd</PARTYLEDGERNAME>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Havells India Ltd</LEDGERNAME><AMOUNT>20000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
    <ALLLEDGERENTRIES.LIST><LEDGERNAME>Purchase @ 18%</LEDGERNAME><AMOUNT>-19000.00</AMOUNT></ALLLEDGERENTRIES.LIST>
  </VOUCHER></TALLYMESSAGE>
 </REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>
"""
with open(os.path.join(here, "tally-export.xml"), "wb") as f:
    f.write(b"\xff\xfe" + tally.replace("\n", "\r\n").encode("utf-16le"))

zoho = '''Display Name,Company Name,Contact Type,GST Identification Number (GSTIN),Mobile Phone,EMail ID,Place of Supply,Opening Balance
"Gupta Traders, Mysuru",Gupta Traders,customer,,9876543210,gupta@example.com,KA,"12,000.00"
Sharma Kirana and Sons,,customer,,,,Karnataka,0
Polycab Wires,Polycab India Ltd,vendor,27AAACP1234A1Z5,,,Maharashtra,45000
"Note ""quoted""
Name",,customer,,,,,
'''
with open(os.path.join(here, "zoho-contacts.csv"), "w") as f:
    f.write(zoho)

def col(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s

rows = [
    ["Date", "Voucher No", "Voucher Type", "Ledger", "Debit", "Credit", "Narration"],
    [46143, "JV-1", "Journal", "Electricity", 3200, "", "April power bill"],
    ["", "JV-1", "Journal", "HDFC Bank A/c", "", 3200, ""],
    [46144, "JV-2", "Journal", "Gupta Traders, Mysuru", 1500, "", "Short billed"],
    ["", "JV-2", "Journal", "Sales @ 18%", "", 1400, ""],
]
shared = []
def sidx(v):
    if v not in shared:
        shared.append(v)
    return shared.index(v)
sheet_rows = []
for r, row in enumerate(rows):
    cells = []
    for c, v in enumerate(row):
        ref = f"{col(c)}{r+1}"
        if v == "":
            continue
        if isinstance(v, (int, float)):
            style = ' s="1"' if c == 0 and r > 0 else ""
            cells.append(f'<c r="{ref}"{style}><v>{v}</v></c>')
        else:
            cells.append(f'<c r="{ref}" t="s"><v>{sidx(v)}</v></c>')
    sheet_rows.append(f'<row r="{r+1}">{"".join(cells)}</row>')
sheet = f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>'
sst = '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + "".join(f"<si><t>{s.replace('&','&amp;')}</t></si>" for s in shared) + "</sst>"
styles = '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>'
workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Journal" sheetId="1" r:id="rId1"/></sheets></workbook>'
rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
with zipfile.ZipFile(os.path.join(here, "bookkeeper-journal.xlsx"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr("xl/workbook.xml", workbook)
    z.writestr("xl/_rels/workbook.xml.rels", rels)
    z.writestr("xl/worksheets/sheet1.xml", sheet)
    z.writestr("xl/sharedStrings.xml", sst)
    z.writestr("xl/styles.xml", styles)
print("ok")
