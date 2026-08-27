# Ponto Residentes — App Android

APK nativo do controle de jornada, para uso do residente no celular.

- **Pacote:** `br.org.imip.pontoresidentes`
- **Nome:** Ponto Residentes · **versão** 1.0 (versionCode 1)
- **minSdk 23** (Android 6.0) · **targetSdk 35** (Android 15)
- **Stack:** React + TypeScript (Vite) empacotado com Capacitor 7; mesmo
  Supabase e as mesmas regras de jornada do app web.

## Por que Capacitor e não React Native

As regras da jornada vivem em `src/lib/domain.ts`, cópia direta do arquivo
homônimo do app web. Manter um único conjunto de regras em TypeScript evita
que app e web divirjam sobre o que é uma batida válida — que é justamente o
tipo de bug que gera contestação de folha de ponto. O Capacitor entrega GPS,
rede e armazenamento nativos sem reescrever a camada de domínio.

## Requisitos de build

| Item | Versão | Observação |
|---|---|---|
| Node | 20+ | |
| JDK | 17+ | testado com Temurin 21 |
| Android SDK | platform 35, build-tools 34+ | `ANDROID_HOME` definido |

O `android/local.properties` aponta o SDK e **não é versionado**.

## Configuração

```bash
cp .env.example .env    # preencher com URL e anon key do Supabase
npm install
```

A `anon key` é pública por natureza (vai no bundle do cliente); o que protege
os dados é o RLS do Supabase, não o segredo da chave.

## Rodar em desenvolvimento

```bash
npm run dev        # navegador, com os plugins web do Capacitor
```

## Gerar o APK

```bash
npm run apk:release   # build + cap sync + gradlew assembleRelease
```

Saída: `android/app/build/outputs/apk/release/app-release.apk`

Para instalar direto num aparelho conectado:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Assinatura

O release é assinado com `android/app/ponto-release.keystore`, cujas
credenciais ficam em `android/keystore.properties` (fora do Git — veja
`keystore.properties.example`). **Guarde o keystore**: sem ele não é possível
publicar atualizações do mesmo app.

Se `keystore.properties` não existir, o build ainda roda, mas gera um APK não
assinado.

## Permissões Android

| Permissão | Para quê |
|---|---|
| `INTERNET` | Supabase e tiles do mapa |
| `ACCESS_NETWORK_STATE` | detectar ausência de conexão (fila offline) |
| `ACCESS_FINE_LOCATION` / `ACCESS_COARSE_LOCATION` | geolocalização da batida |

GPS é declarado como `required="false"`: o app instala em qualquer aparelho,
mas a batida exige um fix de localização.

## Regras de jornada

Idênticas às do sistema web, validadas em três camadas:

1. **Interface** — só mostra a ação permitida (`nextEvent`, `blockReason`);
2. **App** — revalida antes de enfileirar;
3. **Banco** — trigger `ponto_fn_check_sequence` (migrations 0003–0005).

Regras: entrada 1×/dia · saída 1×/dia · vários intervalos · nunca dois
intervalos abertos · saída bloqueada com intervalo aberto · após a saída,
nenhuma batida nova naquele dia.

A camada 3 é a que vale: um usuário que altere o app não burla o servidor.

## Modo offline

Sem conexão, a batida entra numa fila em `Preferences` (SharedPreferences) e
o app mostra o aviso de pendência. Ao voltar a rede — ou ao abrir o app —
a fila é enviada em ordem cronológica.

**Não duplica:** o `id` (UUID) é gerado no aparelho antes do envio e é a
primary key da linha. Se a resposta se perde, o reenvio usa o mesmo id e o
banco recusa com `23505`, que o app trata como "já sincronizada".

**Horário preservado:** batida enviada na hora não informa horário (o
servidor carimba com `now()`, inforjável). Só a que ficou na fila reivindica
o horário real, aceito pelo trigger dentro de 24h e marcado com `is_offline`.

## Telas

- **Ponto** — relógio em tempo real, estado da jornada em destaque, botão
  principal de 220 px, indicadores de GPS/rede/sincronização.
- **Mapa das Batidas** — marcadores de todas as batidas do dia, com tipo,
  hora e coordenadas.
- **Histórico** — jornadas por dia, expansíveis, com mapa do dia.

## Testes

```bash
npx vite preview --port 4173 &
node flow-test.mjs      # Login → Entrada → 2 intervalos → Saída → Mapa → Histórico
node offline-test.mjs   # offline → fila → sincronização → sem duplicatas
```

Rodam contra o Supabase real com as contas de demonstração
(`*.demo@pontoresidentes.app`). O `offline-test` faz uma batida online antes
de cortar a rede: servido por HTTP, o `setOffline` do Playwright bloqueia até
o localhost e impediria o carregamento tardio do plugin — no APK isso não
ocorre, porque os arquivos vêm de `file://` e o plugin é nativo.
