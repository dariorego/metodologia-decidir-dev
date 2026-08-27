A partir do sistema já desenvolvido, crie agora a versão mobile Android em APK, mantendo todas as funcionalidades, regras de negócio, identidade visual e integrações existentes.

Objetivo

Transformar a aplicação atual em um aplicativo Android instalável (APK), pronto para ser instalado e utilizado em celulares Android.

Requisitos

* Gerar um APK de produção, não apenas uma demonstração ou protótipo.
* Manter a integração atual com TypeScript + Supabase.
* Manter autenticação e banco de dados.
* Manter todas as regras de controle de jornada.
* Implementar captura de GPS/geolocalização diretamente pelo celular.
* Solicitar as permissões Android necessárias.
* Garantir funcionamento em diferentes tamanhos de tela.
* Criar ícone e Splash Screen do aplicativo.
* Configurar nome e identificação do aplicativo.
* Configurar build para Android.
* Gerar o arquivo .apk final.

Controle de jornada

O APK deve manter exatamente este fluxo:

Entrada da Jornada → Início do Intervalo → Fim do Intervalo → Saída da Jornada

Regras:

* Entrada somente uma vez por dia.
* Saída somente uma vez por dia.
* Permitir vários intervalos no mesmo dia.
* Não permitir dois intervalos abertos simultaneamente.
* Não permitir saída enquanto houver intervalo aberto.
* Após a saída, bloquear novas batidas naquele dia.

Geolocalização

Em cada batida:

* Capturar latitude;
* Capturar longitude;
* Capturar precisão do GPS;
* Registrar data e hora;
* Associar a localização à batida;
* Exibir a localização em mapa.

Criar uma tela “Mapa das Batidas” mostrando os marcadores de todas as batidas realizadas no dia.

Interface mobile

Adaptar a interface para uso exclusivamente mobile, priorizando:

* Botões grandes;
* Fácil utilização com uma mão;
* Status da jornada em destaque;
* Relógio em tempo real;
* Feedback visual após cada registro;
* Indicador de GPS;
* Indicador de sincronização;
* Histórico das jornadas.

Funcionamento

O aplicativo deve:

1. Abrir e verificar a autenticação.
2. Identificar a jornada do dia.
3. Verificar o estado atual da jornada.
4. Apresentar somente as ações permitidas.
5. Obter a localização GPS.
6. Confirmar a batida.
7. Salvar no Supabase.
8. Atualizar imediatamente o status da jornada.
9. Disponibilizar a localização no mapa.

Offline

Preparar o APK para situações de conexão instável:

* Detectar ausência de internet;
* Armazenar temporariamente registros pendentes;
* Sincronizar quando a conexão retornar;
* Evitar registros duplicados;
* Informar claramente ao usuário quando uma batida estiver aguardando sincronização.

Segurança

As regras críticas devem ser validadas também no backend/Supabase, evitando que um usuário consiga burlar as regras através do aplicativo.

Entrega

Ao finalizar, não entregar somente o código-fonte.

Gerar efetivamente:

app-release.apk

O APK deve estar compilado, ser instalável em um dispositivo Android e estar conectado ao ambiente Supabase configurado.

Também disponibilizar o projeto completo utilizado para gerar o APK, permitindo futuras atualizações e geração de novas versões.

Antes de entregar, executar um teste completo do fluxo:

Login → Entrada → Intervalo → Fim do Intervalo → Novo Intervalo → Fim → Saída → Histórico → Mapa

Corrigir qualquer erro encontrado antes de gerar o APK final.