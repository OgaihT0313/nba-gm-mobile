# Gerar o APK

Dois caminhos: **GitHub Actions** (sem cota, recomendado) ou **EAS Build** (na nuvem da
Expo, cota mensal do plano grátis).

## GitHub Actions (sem cota do EAS)

`.github/workflows/build-apk.yml` roda o `expo prebuild` e o Gradle nos servidores do
GitHub e assina o APK com **o mesmo keystore do EAS**. Por isso ele instala por cima do
APK atual sem desinstalar, e o save não se perde. O `versionCode` é 1000 + número da
execução, sempre acima dos que o EAS gerou.

### Configuração (uma vez só)

1. Baixe o keystore do EAS. Isso não gasta build:
   ```
   npx eas-cli credentials -p android
   ```
   Escolha o perfil `preview`, depois **credentials.json** e **Download credentials**.
   Ele grava o `credentials.json` e o `keystore.jks` na pasta. **Não commite os dois**:
   apague-os depois do passo 3 ou guarde fora do repositório.
2. Converta o keystore para texto (PowerShell, na pasta onde está o `.jks`):
   ```
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("keystore.jks")) | Set-Clipboard
   ```
3. No GitHub, abra o repositório e vá em **Settings → Secrets and variables → Actions →
   New repository secret**. Crie quatro secrets:
   | Secret | Valor |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | o texto copiado no passo 2 |
   | `ANDROID_KEYSTORE_PASSWORD` | `keystorePassword` do `credentials.json` |
   | `ANDROID_KEY_ALIAS` | `keyAlias` |
   | `ANDROID_KEY_PASSWORD` | `keyPassword` |

### Gerar um APK

No GitHub, abra **Actions → Build APK → Run workflow**, escolha a branch e clique em
**Run workflow**. O primeiro build leva ~25-35 min; os seguintes são mais rápidos por causa
do cache do Gradle. No fim, o APK aparece em **Releases** como pré-release `apk-10xx`.
Abra essa página no celular e instale.

Por padrão só sai `arm64-v8a` (todo celular Android atual, inclusive o Galaxy): o build fica
pela metade e o APK menor. A caixa "Todas as arquiteturas" gera o APK universal.

Se um dia voltar a buildar pelo EAS, o `versionCode` dele (remoto) tem que passar o último
daqui. Para isso, use `npx eas-cli build:version:set`.

# EAS Build

O build roda **na nuvem da Expo** — não precisa de Android Studio, Gradle, nem JDK
local. É o que resolve toda aquela dor do build do app antigo (Capacitor).

## Pré-requisitos

- Conta Expo (grátis) — você já tem.
- Nada mais. O `eas.json` e o `app.json` já estão configurados neste repo.

## Passos (no PowerShell, dentro de `nba-gm-mobile`)

```
cd "C:\Users\Usuário\Downloads\nba-gm-mobile"
```

**1. Logar na Expo** (abre o navegador / pede usuário e senha):
```
npx eas-cli login
```

**2. Gerar o APK:**
```
npx eas-cli build --platform android --profile preview
```

Na primeira vez ele vai perguntar algumas coisas:
- **"Would you like to create a project?"** → **Y** (cria `NBA GM` na sua conta Expo)
- **"Generate a new Android Keystore?"** → **Y** (a Expo gera e guarda a chave de
  assinatura por você — é o que permite instalar o APK no celular)

Aí ele sobe o código e builda na nuvem (~10-15 min na fila gratuita). No final
imprime um **link de download do `.apk`** — abra esse link no celular e instale.
(O build também fica listado em https://expo.dev nos seus projetos.)

## Config que já está pronta

| Item | Valor |
|---|---|
| Nome do app | **NBA GM** |
| Package Android | `com.thiagonx.nbagm` |
| Ícone | `assets/icon.png` (o mesmo logo do app web) |
| Tema | dark (`#020617`) |
| Perfil `preview` | gera **APK** instalável (não AAB) |

## Atualizar o app depois

Só rodar o comando do passo 2 de novo. Para mudanças **só de JS** (sem libs
nativas novas), dá pra usar OTA update em vez de rebuildar:
```
npx eas-cli update --branch preview
```

## Rodar no celular sem build (dev)

```
npx expo start
```
e ler o QR code com o app **Expo Go** — bom pra testar rápido, mas o Expo Go não
tem os módulos nativos custom; o build `preview` é o app de verdade.
