# Gerar o APK (EAS Build)

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
