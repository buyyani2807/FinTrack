export function InstallGuide({ id = "install" }) {
  return <section className="mkt-section mkt-tint" id={id}>
    <div className="mkt-wrap">
      <div className="mkt-section-head">
        <p className="mkt-kicker">On your phone</p>
        <h2>Install FinTrack on the home screen.</h2>
        <p className="mkt-lead">FinTrack is a web app. Add it once from the browser and it opens from its own icon, with the same sign-in as the site. Owners, collection agents, customers, and chit members can each install it. A collection, voucher, or bid is saved when the phone is online.</p>
      </div>
      <div className="mkt-grid two">
        <article className="mkt-card">
          <h3>iPhone and iPad</h3>
          <p>Use Safari. The home-screen icon is added from Safari’s share menu.</p>
          <ol className="mkt-list">
            <li>Open FinTrack in Safari.</li>
            <li>Tap the Share button at the bottom of Safari.</li>
            <li>Scroll the menu and tap Add to Home Screen.</li>
            <li>Leave the name as FinTrack and tap Add.</li>
            <li>Open the FinTrack icon on the home screen and sign in.</li>
          </ol>
        </article>
        <article className="mkt-card">
          <h3>Android</h3>
          <p>Use Chrome. The menu offers Install app, or Add to Home screen.</p>
          <ol className="mkt-list">
            <li>Open FinTrack in Chrome.</li>
            <li>Tap the three-dot menu in the top corner.</li>
            <li>Tap Install app. If that line is missing, tap Add to Home screen.</li>
            <li>Confirm Install.</li>
            <li>Open FinTrack from the home screen or the app list and sign in.</li>
          </ol>
        </article>
      </div>
      <p className="mkt-lead">On a computer, Chrome or Edge can install it from the install icon in the address bar. The installed app is the same workspace.</p>
    </div>
  </section>;
}
