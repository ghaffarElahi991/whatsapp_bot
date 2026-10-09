# Mayfair WhatsApp Campaigns — MacBook Setup

This guide installs and runs the dashboard locally on a MacBook. The local dashboard is separate from the already deployed website, and values saved in `.env.local` are used only on that Mac.

## What you need

- A supported macOS version
- Administrator access to install developer tools
- Your Meta system-user access token
- The registered WhatsApp **Phone Number ID**
- The exact approved message-template name and language
- The sending number must show **Connected** in WhatsApp Manager

## 1. Install Apple command-line tools

Open **Terminal** from Applications → Utilities and run:

```bash
xcode-select --install
```

Complete the installation window before continuing.

## 2. Install Homebrew, Git, and Node.js 22

Install Homebrew using its official installer:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

At the end, Homebrew prints a command that adds `brew` to your shell. Run that command exactly as shown, then install Git and Node.js 22:

```bash
brew install git node@22
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Verify the installation:

```bash
git --version
node --version
npm --version
```

Node must be version `22.13.0` or newer.

## 3. Download the project from GitHub

```bash
cd ~/Desktop
git clone https://github.com/ghaffarElahi991/whatsapp_bot.git
cd whatsapp_bot
```

## 4. Make the launcher executable

Git normally preserves this permission. Run the following once if Finder says the launcher cannot be executed:

```bash
chmod +x "Start Mayfair WhatsApp.command"
```

## 5. Start the application

In Finder, open the `whatsapp_bot` folder and double-click:

```text
Start Mayfair WhatsApp.command
```

On the first run, the launcher will:

1. Check the installed Node.js version.
2. Create the private `.env.local` file.
3. Open `.env.local` in TextEdit if configuration is missing.
4. Install the Node.js dependencies.
5. Build the application and initialize its local database.
6. Start the dashboard and open `http://localhost:5173` in the browser.

Keep the Terminal window open while using the dashboard. Press **Control+C** in that window to stop it.

If macOS blocks the launcher the first time, Control-click it in Finder, select **Open**, then confirm **Open**.

## 6. Configure the Meta credentials

The launcher opens `.env.local` automatically when values are missing. It should contain:

```env
META_ACCESS_TOKEN=your_system_user_access_token
META_PHONE_NUMBER_ID=your_registered_phone_number_id
META_TEMPLATE_NAME=your_exact_approved_template_name
META_TEMPLATE_LANGUAGE=en
META_GRAPH_API_VERSION=your_enabled_graph_api_version
```

Save the file in TextEdit, return to Terminal, and press Return. The launcher never prints the access token.

`.env.local` is excluded by `.gitignore`. Confirm that before pushing changes:

```bash
git check-ignore .env.local
```

The command should print `.env.local`. Never paste the token into chat, commit it to Git, or store it in `README` files.

## Starting it later

For normal daily use, double-click `Start Mayfair WhatsApp.command` again. Dependencies and the database are reused when they are already installed.

You can also start it from Terminal:

```bash
cd ~/Desktop/whatsapp_bot
npm run dev
```

Then open <http://localhost:5173>.

## Updating from GitHub

Stop the dashboard with **Control+C**, then run:

```bash
cd ~/Desktop/whatsapp_bot
git pull
```

Double-click the launcher again. If `package-lock.json` changed, it automatically installs the updated dependencies.

## Troubleshooting

### `node` or `npm` command not found

Close Terminal, reopen it, and run:

```bash
source ~/.zshrc
node --version
```

### Port 5173 is already in use

Another copy of the dashboard is probably running. Find the Terminal window running it and press **Control+C**, then launch it again.

### Dashboard reports demo or offline mode

Check that all `.env.local` values are present and that the Meta sending number shows **Connected**. An added but Offline number cannot send Cloud API messages.

### Meta returns an authentication error

Generate a new system-user token containing `whatsapp_business_messaging` and `whatsapp_business_management`, update `.env.local`, and restart the launcher.

## Hosted dashboard

The hosted dashboard remains available at:


Local `.env.local` changes do not update the hosted dashboard. Hosted credentials must be updated separately and the Site redeployed.

