Claro. Eu deixaria as regras mais objetivas e sem ambiguidades, principalmente para orientar o desenvolvimento:

Correções e regras da jornada

1. Registro da jornada
    O sistema deverá permitir os seguintes tipos de batida:
    * Entrada da jornada
    * Início do intervalo
    * Fim do intervalo
    * Saída da jornada
2. Regras de entrada e saída
    * A Entrada da jornada poderá ser registrada apenas uma vez por dia.
    * A Saída da jornada poderá ser registrada apenas uma vez por dia.
    * Não permitir uma nova entrada após a entrada inicial.
3. Intervalos
    * O funcionário poderá realizar um ou mais intervalos no mesmo dia.
    * Cada intervalo deverá obrigatoriamente possuir:
        * Início do intervalo;
        * Fim do intervalo.
    * Não permitir iniciar um novo intervalo enquanto existir um intervalo anterior sem encerramento.
4. Regra para saída da jornada
    * O sistema deverá obrigar o encerramento do intervalo antes de permitir a saída da jornada.
    * Se existir um intervalo aberto, o botão/opção “Saída da jornada” deverá permanecer bloqueado.
    * O usuário deverá registrar primeiro o Fim do intervalo.
5. Geolocalização das batidas
    * Cada batida deverá armazenar a geolocalização (latitude e longitude) no momento do registro.
    * O sistema deverá disponibilizar uma opção para visualizar a localização da batida em um mapa.
    * No mapa, apresentar pelo menos:
        * Tipo da batida;
        * Data e hora;
        * Localização;
        * Marcador no mapa.
    * Quando houver várias batidas no dia, permitir visualizar todas as localizações em conjunto no mapa.
6. Fluxo esperado

Entrada → Intervalo 1 → Fim Intervalo 1 → Intervalo 2 → Fim Intervalo 2 → … → Saída

A quantidade de intervalos é variável, mas deve sempre existir a regra:

Início do intervalo → Fim do intervalo

E somente após todos os intervalos serem encerrados o sistema poderá permitir a Saída da jornada.