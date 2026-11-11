import { LiveDemo, MainnetForest } from "./components/Live";

const STAKE_ROWS = [
  { name: "12+ characters", rent: 7.5 },
  { name: "9 to 10 characters", rent: 15 },
  { name: "6 to 8 characters", rent: 30 },
  { name: "5 or fewer", rent: 75 },
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <p className="kicker">Evergreen · NEAR Top Level Accounts</p>
        <h1>
          NEAR names now expire.
          <em>This one keeps itself alive.</em>
        </h1>
        <p className="lede">
          A name like <code>alice.bot</code> is an NFT and a real account, leased for a year. Miss the renewal and anyone
          can take it. An Evergreen Name is owned by a small Steward contract: it stakes the Name&apos;s own NEAR and pays
          each year&apos;s Rent from the rewards. The principal is never spent.
        </p>
        <ul className="tags">
          <li>An NFT that is an account</li>
          <li>Owns its own stake</li>
          <li>Pays its own Rent</li>
          <li>Anyone can throw it a Lifeline</li>
        </ul>
      </section>

      <section className="live" id="live">
        <h2>
          Watch <span>one Name renew itself, one run out</span>
        </h2>
        <LiveDemo />
      </section>

      <section className="mainnet" id="mainnet">
        <h2>
          Mainnet <span>every real Name is on a clock</span>
        </h2>
        <MainnetForest />
      </section>

      <section className="how" id="how">
        <h2>
          How <span>it works, and what it costs</span>
        </h2>
        <ol className="steps">
          <li>
            <b>Hand over.</b> You transfer your Name to a Steward contract made for it. You stay its Patron and can take
            the Name back at any time.
          </li>
          <li>
            <b>Stake once.</b> The Name stakes its own NEAR in a staking pool. Tips from anyone are added to the Stake.
          </li>
          <li>
            <b>Anyone pokes.</b> Near expiry, anyone can poke the Steward. It takes exactly the next Rent out of the
            rewards and pays the registry&apos;s open renewal.
          </li>
          <li>
            <b>If rewards fall short,</b> it pulls the whole Stake back onto the Name before expiry, because stake left
            in a pool passes to whoever rents the Name next.
          </li>
        </ol>
        <table className="soon">
          <thead>
            <tr>
              <th>Name length</th>
              <th>Rent per year</th>
              <th>Stake that pays it at 5% yield</th>
            </tr>
          </thead>
          <tbody>
            {STAKE_ROWS.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>${row.rent.toFixed(2)}</td>
                <td>${(row.rent / 0.05).toFixed(0)}, kept by you</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="fine">
          Rent shown for an Open Standard Namespace at the registry&apos;s default prices. The Top Level Accounts registry
          and wallet are third-party, audited and unmodified (houseofstake/tla-contracts at d85860a). The Steward is new
          and unaudited.
        </p>
      </section>
    </main>
  );
}
