08-27 Reunião: Requisitos para Sistema de Controle de Ponto de Residentes
Partes interessadas
Cliente/Jurisdição: Não informado na reunião

Requisitos
Requisitos funcionais
Cadastro de residentes:

Registrar dados básicos e status do residente.

Manter data de entrada e data de saída na instituição.

Controle de ponto dos residentes:

Registro de eventos de ponto: início de jornada, início de intervalo, fim de intervalo, saída/fim de jornada.

Capturar o setor/local onde o ponto foi iniciado (geolocalização ou seleção de setor).

Permitir inserção/edição manual de ponto pela administração quando o residente esquecer de registrar.

Regra de negócio: se o residente esquecer de finalizar um ponto em data anterior, exigir justificativa antes de iniciar nova jornada.

Notificação automática à administração quando houver esquecimento de finalização de ponto anterior.

Perfis de usuário:

Residente: registrar ponto; justificar esquecimento; visualizar seus registros.

Administração: cadastrar/gerenciar residentes; inserir/alterar pontos manualmente; revisar justificativas; aprovar/reprovar ajustes; receber notificações.

Relatórios:

Relatórios para gerência/administradores indicando presença, status “na instituição”, histórico de pontos, atrasos, ausências, intervalos.

Visualização de quem está atualmente na instituição.

Consolidação de dados:

“Sistema consola”: consolidar registros de entrada/saída e intervalos por residente e por período para cálculo de jornada.

Requisitos não funcionais
Usabilidade: Interface simples para registro rápido de ponto e justificativas; fluxos guiados para evitar erros.

Disponibilidade: Sistema acessível durante horários de operação da instituição; tolerante a falhas em registro de ponto.

Confiabilidade: Garantia de integridade dos registros de ponto; trilha de auditoria para alterações manuais.

Escalabilidade: Suporte a múltiplos residentes e setores, com crescimento da instituição.

Manutenibilidade: Configuração de regras (ex.: políticas de justificativa) sem necessidade de desenvolvimento.

Observabilidade: Log de eventos e notificações para auditoria e suporte.

Requisitos de dados
Dados de residente: identificação, status ativo/inativo, datas de entrada e saída.

Dados de ponto: residente, tipo de evento (início, intervalo, retorno, saída), data/hora, setor/local, origem (manual/automático), justificativa quando aplicável, aprovador, carimbo de criação/alteração.

Estruturas de setor/local: cadastro de setores com identificação única.

Logs/auditoria: quem alterou, quando, qual campo, motivo.

Formatos: datas e horas em padrão ISO 8601; IDs únicos para entidades.

Retenção: política de retenção de registros de ponto e justificativas (não definida).

Requisitos de interface do usuário
Tela de registro rápido de ponto para residente, com feedback imediato.

Tela de justificativa obrigatória quando houver ponto anterior não finalizado.

Painel da administração com:

Lista de residentes “na instituição” em tempo real.

Filtros por período, setor e status.

Fluxo de inserção/edição manual de ponto com motivo e aprovação.

Relatórios exportáveis (CSV/PDF) para gerência.

Notificações visíveis e/ou por e-mail/app para administração sobre esquecimentos.

Requisitos de desempenho
Tempo de resposta:

Registro de ponto: < 2 segundos por operação.

Carregamento do painel administrativo: < 3 segundos para até N registros (N não definido).

Processamento de consolidação: execução diária/near real-time sem impacto no uso.

Requisitos de segurança
Controle de acesso por perfil (Residente, Administração).

Autenticação de usuários; prevenção de registro por terceiros não autorizados.

Autorização para edição manual limitada à administração, com justificativa e auditoria.

Proteção de dados pessoais dos residentes (criptografia em repouso e em trânsito).

Prevenção de fraude de ponto (ex.: restrições por localização/setor, validação de dispositivo).

Requisitos regulatórios e de conformidade
Conformidade com proteção de dados pessoais (ex.: LGPD) quanto a consentimento, finalidade, retenção e direitos dos titulares.

Atender políticas internas da instituição sobre jornada e registros (norma interna não especificada).

Suposições e Restrições
Suposições
O “residente” é o público que registra ponto (não colaboradores tradicionais).

O controle de ponto segue jornadas com início, intervalos e fim, podendo haver esquecimento de finalização.

A administração tem autoridade para ajustar registros e exigir justificativas.

Setores são predefinidos e selecionáveis no momento do ponto.

Notificações à administração são desejadas via plataforma; o canal específico (e-mail, app, SMS) não foi definido.

Restrições
Necessidade de justificativa obrigatória para iniciar nova jornada quando a anterior não foi finalizada.

Alterações manuais devem gerar auditoria e, possivelmente, aprovação.

Sem informação sobre integração com sistemas existentes da instituição.

Sem definição de dispositivos de registro (web, mobile, totem), o que pode restringir usabilidade e captura de localização.

Definições
Residente: pessoa vinculada à instituição que faz registro de ponto (termo pode necessitar de esclarecimento quanto a status e direitos).

Setor: área/local da instituição onde o residente inicia o ponto; pode ser uma unidade física ou departamento.

Consolidação (“sistema consola”): processo de agregar registros de entrada/saída e intervalos para computar jornadas.

Esquecimento de finalização: ausência do evento de “saída” em dia anterior; aciona justificativa e notificação.

Lacunas
Informadas pelo cliente:

Necessidade de controle de ponto específico para residentes, com justificativas e notificações por esquecimento.

Falta de relatórios que indiquem se o residente está “na instituição” em tempo real.

Identificadas por nós:

Canais de notificação não definidos (e-mail, push, SMS).

Dispositivos e métodos de registro de ponto não definidos (mobile, web, totem, biometria).

Regras detalhadas de jornada não especificadas (horários, limites de intervalo, tolerâncias).

Políticas de aprovação de ajustes manuais não definidas (quem aprova, SLA).

Requisitos de retenção de dados e privacidade (LGPD) não detalhados.

Escopo de relatórios não especificado (KPIs, periodicidade, exportação).

Integrações com outros sistemas da instituição não mencionadas.

Critérios de “setor/local” e necessidade de geofencing ou validação de presença não esclarecidos.

Critérios de desempenho e capacidade (número de residentes, picos de registro) não definidos.

Decisões e Itens de ação em 2026-08-27
Decisão: A plataforma terá perfis de Residente e Administração com capacidades distintas.

Decisão: Justificativa obrigatória para iniciar nova jornada quando houver ponto anterior não finalizado, com notificação à administração.

Item de ação: Levantar canais de notificação preferidos.

Item de ação: Definir dispositivos e UX de registro de ponto.

Item de ação: Detalhar regras de jornada e políticas de aprovação de ajustes.

Item de ação: Especificar relatório “quem está na instituição agora” e demais relatórios operacionais.

Item de ação: Confirmar requisitos de LGPD e políticas de retenção.

Item de ação: Verificar necessidade de integração com sistemas atuais da instituição.

Item de ação: Definir modelo de dados para setores e validação de localização.

Sugestões e alertas (riscos/ambiguidades)
Ambiguidade no termo “residente”: confirmar se há perfis especiais (ex.: estagiário, visitante) e diferenças de regras.

Risco de fraude de ponto: considerar validação por localização, dispositivos autorizados, ou autenticação forte (biometria, 2FA).

Auditoria e conformidade: estabelecer trilha completa para alterações e justificativas, com retenção adequada.

Escalabilidade e desempenho: dimensionar para picos de marcação (ex.: início de turnos).

Usabilidade: garantir fluxo claro para justificativas e correções para minimizar atritos e erros.

Privacidade: aplicar princípios de minimização de dados e transparência para atender LGPD.

Continuidade operacional: prever registro offline com sincronização, caso o dispositivo não tenha conexão.

Governança: definir papéis e responsabilidades na administração (quem pode aprovar, revisar, reverter).

Relatórios: alinhar métricas de gestão (presença, horas, atrasos) e formatos de exportação antecipadamente.

