# ⚽ Amigos da Bola - App Comercial (Android / Web)

Versão comercial moderna do **Amigos da Bola**, reestruturada em paralelo para publicação na **Google Play Store**.

---

## 🚀 Tecnologias Utilizadas
* **Vite** + **Tailwind CSS v4** (Bundle ultra-otimizado de ~75 KB gzip, sem CDN).
* **Capacitor 6** (Empacotamento Android Nativo com plugins de compartilhamento nativo no WhatsApp e Toasts).
* **Supabase Client v2** (Arquitetura Multi-Tenant isolada com Row Level Security e índices de alta performance).

---

## 📁 Estrutura do Projeto
```text
amigos-da-bola-app/
├── android/                 # Projeto nativo Android (pronto para Android Studio)
├── database/
│   └── schema.sql           # Script SQL Multi-Tenant para executar no Supabase
├── public/
│   └── icon.png             # Ícone do aplicativo
├── src/
│   ├── main.js              # Controlador principal (partidas, times, caixa)
│   ├── style.css            # Estilos com safe-area e animações
│   ├── supabase.js          # Conexão com o banco
│   └── ui.js                # Modais e Toasts nativos (zero window.alert/prompt)
├── capacitor.config.json    # Configurações do Capacitor (App ID, Nome)
└── package.json
```

---

## 🛠️ Como Executar em Desenvolvimento

1. **Instalar dependências (se clonar em outro ambiente):**
   ```bash
   npm install
   ```

2. **Iniciar servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```
   Acesse: `http://localhost:3000`

---

## 📱 Como Gerar a Build para a Google Play Store

1. **Compilar a versão de produção e sincronizar com o Android:**
   ```bash
   npm run build
   npx cap sync
   ```

2. **Abrir o projeto no Android Studio:**
   ```bash
   npx cap open android
   ```

3. **No Android Studio:**
   * Vá em **Build** > **Generate Signed Bundle / APK...**
   * Selecione **Android App Bundle (.aab)**.
   * Selecione sua chave de assinatura (Keystore) ou crie uma nova.
   * O arquivo `.aab` gerado estará pronto para upload no **Google Play Console**.

---

## 🗄️ Configuração do Banco de Dados (Supabase)

Para ativar a funcionalidade de múltiplos times e isolamento total:
1. Acesse o dashboard do seu projeto no **Supabase**.
2. Vá em **SQL Editor**.
3. Copie o conteúdo de [`database/schema.sql`](database/schema.sql) e clique em **Run**.
