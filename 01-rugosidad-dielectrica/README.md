# Retrodispersión SAR interactiva

Esta visualización homologa el video de referencia como una animación programada e interactiva. Permite mover la constante dieléctrica relativa, la rugosidad `h_rms/λ` y el ángulo de incidencia para observar cómo cambian la reflexión especular, la dispersión difusa y la fracción que vuelve al sensor.

El modelo es pedagógico, no un sustituto de un modelo físico completo como IEM, Oh o Dubois. La lógica usada es:

- La reflectividad aumenta con la constante dieléctrica mediante una aproximación tipo Fresnel normalizada.
- La rugosidad aumenta la dispersión angular y reduce el dominio especular.
- La retrodispersión crece sobre todo cuando coinciden reflectividad alta y rugosidad alta.
- La lectura `σ°` en dB es una escala relativa para comparar escenarios dentro de esta animación.

## Casos de referencia

| Caso | Resultado visual esperado |
| --- | --- |
| Baja εr + baja rugosidad | Superficie lisa y poco reflectiva, retorno muy débil |
| Alta εr + baja rugosidad | Reflexión fuerte, principalmente especular y alejada del sensor |
| Baja εr + alta rugosidad | Dispersión parcial, retorno moderado-bajo |
| Alta εr + alta rugosidad | Dispersión intensa con retorno alto hacia la antena |

## Fuentes consultadas

- NASA NISAR, “Get to Know SAR”: https://science.nasa.gov/mission/nisar/get-to-know-sar/
- ASF HyP3, “Introduction to SAR”: https://hyp3-docs.asf.alaska.edu/hyp3-docs/guides/introduction_to_sar/
- ESA, “Some Basic Radar Principles”: https://www.esa.int/esapub/sp/sp1199/get21.htm
- JPL AIRSAR, “Radar”: https://airsar.jpl.nasa.gov/documents/genairsar/radar.html
