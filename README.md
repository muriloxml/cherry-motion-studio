# Cherry Motion Studio 2.0 🍒🎬
### Premiere Pro Native Motion & Kinetic Typography Plugin with OTA Auto-Updater

Cherry Motion Studio é uma extensão nativa de alto desempenho para o **Adobe Premiere Pro**, trazendo um catálogo com mais de 29 templates de cinética (Kinetic Slam, Horizon Split, Frameless Kinetic, Haute Couture, Hooks e Elementos) com renderização frame-accurate, controle de cores por caractere e sincronização em tempo real na timeline.

---

## 🚀 Instalação Rápida (1 Clique)

1. Baixe a pasta [Distribuicao_Plugin/](Distribuicao_Plugin/) ou o instalador [.ZXP](Distribuicao_Plugin/Cherry_Motion_Studio_LATEST.zxp).
2. Dê dois cliques em **`INSTALAR_CHERRY_MOTION_1_CLIQUE.bat`**.
3. Abra o **Adobe Premiere Pro** -> **Window (Janela)** -> **Extensions (Extensões)** -> **Cherry Motion Studio**.

---

## 🔄 Sistema de Atualização Over-The-Air (OTA)

O Cherry Motion Studio inclui um mecanismo nativo de **Auto-Update OTA** via GitHub.
- Toda vez que uma nova versão é lançada, os usuários recebem uma notificação direta na interface: `vX.Y.Z Disponível! ⚡`.
- Clicando em **"Atualizar Agora"**, o plugin baixa o pacote delta via GitHub Raw e aplica o update em tempo real sem precisar reinstalar o `.zxp`.

---

## 🛠️ Publicando Atualizações (Criador / Editor)

Para gerar uma nova versão oficial:
1. Execute **`PUBLICAR_NOVA_VERSAO_OTA.bat`** (ou clique no botão *Publicar Nova Versão* no Studio).
2. O publicador incrementará a versão, gerará o novo `.zxp` assinado com Adobe ZXPSignCmd, compilará o `ota_bundle.json` e o `release_manifest.json`, e fará o push automático para este repositório no GitHub.

---

*Desenvolvido para editores exigentes • Licença MIT / GTK Edição.*
