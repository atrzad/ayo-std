# Ayo Std

Painel de estudos em pixel art (estética soulslike) que une os cofres do Obsidian: Trilha Dev, ENEM, Manaus Previdência e BB.

- Site: https://ayo-std.tail9ff58.ts.net (internet, via container Tailscale em `deploy/tailscale`) · http://localhost:3300 (local)
- Serviço: `systemctl --user status ayo-std` · log: `journalctl --user -u ayo-std -f`
- Contas: página `/conta` no site (dono cria contas; todos trocam nome e senha) · pelo terminal: `npm run senha -- <usuario>`
- Perfis de acesso: `config/perfis.json`
- Cofres e temas: `config/trilhas.json` · porta e pastas: `.env`
- Documentação completa: `~/Projects Vaults/ayo-std-vault/`

As notas `.md` dos cofres são a fonte da verdade. O site marca tarefas direto nos arquivos (com backup e escrita atômica) e grava questões no `registro-questoes.csv` de cada cofre.
