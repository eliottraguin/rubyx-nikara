import Link from "next/link";
import { ResumeBox } from "@/screens/ResumeBox";

export default function Home() {
  return (
    <div className="page">
      <section className="hero">
        <h1>Dirigez une petite entreprise et apprenez à travailler avec des agents IA.</h1>
        <p className="lead">
          Vous recevez des commandes de clients, vous donnez des consignes à vos agents, vous vérifiez leur travail, puis
          vous livrez. Les réponses des agents sont générées ; les clients, les revenus et les événements sont simulés.
        </p>
        <div className="row">
          <Link className="btn btn-primary" href="/creer">
            Démarrer une nouvelle entreprise
          </Link>
          <span className="muted">Vous arriverez sur la carte : c&apos;est de là que vous envoyez vos agents.</span>
        </div>
        <ResumeBox />
      </section>

      <section aria-labelledby="modes">
        <h2 id="modes">Deux façons de jouer</h2>
        <div className="grid2">
          <article className="card">
            <h3>Débutant</h3>
            <p>
              Une petite entreprise de services numériques. Le jeu vous guide une action à la fois : lire le client,
              choisir l&apos;agent, formuler la consigne, inspecter le résultat. Des indices sont disponibles.
            </p>
          </article>
          <article className="card">
            <h3>Expert</h3>
            <p>
              Une agence de communication. Les commandes sont plus ouvertes, vous avez plus d&apos;autonomie et l&apos;aide
              est facultative.
            </p>
          </article>
        </div>
        <p className="muted">Mêmes règles dans les deux modes : 30 $ de jeu au départ, un rédacteur, 5 messages par agent et par commande.</p>
      </section>
    </div>
  );
}
