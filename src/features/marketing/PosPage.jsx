import { useEffect } from "react";
import { Check, Lock, MessageCircle, Printer, Search, WifiOff } from "lucide-react";
import { RevealProvider } from "../../components/ui/Reveal.jsx";
import { ModeSwitch, ModuleClosing, ModuleFaq, ModuleHero, SectionHead, Tile } from "./ModuleKit.jsx";

// Sample figures in the tile pictures; totals and change are the sums of their lines.
const ITEMS = ["Basmati Rice", "Sunflower Oil", "Toor Dal", "Tea Powder", "Sugar 1kg", "Atta 5kg"];
const BILL = [
  { item: "Sunflower Oil 1L × 2", amount: "₹340" },
  { item: "Basmati Rice 5kg", amount: "₹625" },
  { item: "Toor Dal 1kg", amount: "₹160" },
];
const MODES = [
  { key: "sale", label: "A sale", slug: "counter-pos", scene: "accounts-counter", line: "From the first item to the receipt, on one screen.", link: false },
];

export function PosPage({ feature }) {
  useEffect(() => { document.title = "POS — FinTrack"; }, []);
  return <RevealProvider intent="landing"><div className="hm-home fx">
    <ModuleHero
      name="POS"
      title="A billing counter that posts straight into your books."
      lead="A till for walk-in and khata sales. Charge posts the sale, updates stock, and prints or shares the receipt."
      appPath={feature.appPath}
      scene="accounts-counter"
      frameLabel="Counter · Till"
    />

    <section className="fx-sec fx-bento-sec">
      <div className="mkt-wrap">
        <SectionHead eyebrow="Inside POS" title="Everything the counter needs." />
        <div className="fx-bento">
          <Tile tag="Till" size="lg" title="Search, favourites, and categories on one till screen.">
            <div className="fx-card fx-pos">
              <div className="fx-pos-search"><Search size={14} /> Search items</div>
              <div className="fx-pos-items">{ITEMS.map(item => <span key={item}>{item}</span>)}</div>
              <ul>
                {BILL.map(line => <li key={line.item}><span>{line.item}</span><strong>{line.amount}</strong></li>)}
              </ul>
              <span className="fx-charge">Charge ₹1,125</span>
            </div>
          </Tile>
          <Tile tag="Payments" size="wide" title="Cash, UPI, bank, or a split, with change due on cash.">
            <div className="fx-card fx-tender">
              <div className="fx-tenders"><span className="fx-pill is-on">Cash</span><span className="fx-pill">UPI</span><span className="fx-pill">Bank</span><span className="fx-pill">Cash + UPI</span></div>
              <dl>
                <div><dt>Total</dt><dd>₹1,125</dd></div>
                <div><dt>Tendered</dt><dd>₹1,200</dd></div>
                <div className="is-on"><dt>Change due</dt><dd>₹75</dd></div>
              </dl>
            </div>
          </Tile>
          <Tile tag="Khata" title="Walk-in cash sales and named khata customers.">
            <div className="fx-card fx-rows">
              <p>Today’s bills</p>
              <p><span>Walk-in</span><b className="fx-pill is-on">Cash</b></p>
              <p><span>Ravi Stores</span><b className="fx-pill">Khata</b></p>
              <p><span>Walk-in</span><b className="fx-pill is-on">UPI</b></p>
            </div>
          </Tile>
          <Tile tag="Day close" title="Hold bills, take returns, and close the day by till.">
            <div className="fx-card fx-rows">
              <p>Till 1 · Day close</p>
              <p><span>Bills</span><strong>42</strong></p>
              <p><span>Held</span><strong>1</strong></p>
              <p className="is-total"><span>Returns</span><strong>2</strong></p>
            </div>
          </Tile>
          <Tile tag="Receipts" title="Print a thermal slip or share it on WhatsApp.">
            <div className="fx-receipt-pair">
              <span className="fx-card fx-chip"><Printer size={14} /> 80 mm slip</span>
              <span className="fx-card fx-chip"><MessageCircle size={14} /> WhatsApp</span>
            </div>
          </Tile>
          <Tile tag="Cashiers" title="Cashier logins that open the Counter only.">
            <div className="fx-card fx-rows fx-checks">
              <p><Lock size={14} /> Cashier · Till 1</p>
              <p><Check size={14} strokeWidth={3} /><span>Counter</span></p>
              <p><span className="fx-off">—</span><span>Rest of Accounts</span></p>
            </div>
          </Tile>
          <Tile tag="Offline" title="Paid bills queue when the line drops, then sync.">
            <div className="fx-card fx-rows">
              <p><WifiOff size={14} /> Offline</p>
              <p><span>Queued bills</span><strong>3</strong></p>
              <p className="is-total"><span>When back online</span><strong>Sync</strong></p>
            </div>
          </Tile>
          <Tile slug="inventory" title="Stock moves with every sale.">
            <div className="fx-card fx-stock">
              <div><span>Basmati Rice 5kg</span><i><em style={{ width: "72%" }} /></i></div>
              <div><span>Toor Dal 1kg<b className="fx-pill">Low</b></span><i><em style={{ width: "16%" }} /></i></div>
            </div>
          </Tile>
        </div>
      </div>
    </section>

    <section className="fx-sec hm-flip">
      <div className="mkt-wrap">
        <SectionHead eyebrow="How a sale works" title="Three steps from item to receipt." />
        <ModeSwitch label="Sale" modes={MODES} />
      </div>
    </section>

    <ModuleFaq title="POS, answered." questions={["Does it have a POS / billing counter?", "Does it support GST?", "Can I use it only for accounting?", "Can I install it on my phone?"]} />
    <ModuleClosing title="Open the counter in FinTrack." appPath={feature.appPath} points={["Cash, UPI, and khata", "Thermal and WhatsApp receipts", "Stock moves with every sale"]} />
  </div></RevealProvider>;
}
