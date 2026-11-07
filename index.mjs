import { AxisClient } from "@axis/sdk";
const axis = new AxisClient({ tools: [] }); 
const r = await axis.chat({
conversationId: "premier-essai",
userId: "noah.savoye@epitech.eu",
message: "Écris le fichier idees.md avec 3 idées de projet, et donne-moi le lien.",
});
console.log(r.kind, r.reply ?? r.result);
for (const f of r.artifacts ?? []) console.log("fichier :", f.filename, f.url); 