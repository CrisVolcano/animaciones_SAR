# Coberturas, polarización y bandas SAR

Visualización conceptual para comparar mecanismos de retrodispersión SAR en árboles, infraestructura, pastos y cultivos.

## Controles

- Cobertura: árboles, infraestructura, pastos y cultivos.
- Polarización: `VV`, `VH`, `HH`, `HV`.
- Banda: `X` (~3.1 cm), `C` (~5.6 cm), `L` (~23 cm).
- Volumen/biomasa, humedad o contraste dieléctrico, estructura/orientación y ángulo de incidencia.

## Lectura conceptual

- `VV` y `HH` son co-polarizaciones: tienden a conservar el plano transmitido y suelen resaltar superficie, geometría y doble rebote.
- `VH` y `HV` son polarizaciones cruzadas: aparecen cuando el objetivo despolariza la señal, algo típico de volúmenes vegetales complejos.
- Banda `X`: longitud de onda corta, sensible a hojas, copas y rugosidad fina.
- Banda `C`: respuesta intermedia, útil para vegetación herbácea/cultivos y parte del dosel.
- Banda `L`: longitud de onda mayor, mejor penetración relativa en vegetación y más interacción con ramas gruesas, troncos, suelo o estructuras.

El modelo es pedagógico y relativo: no implementa descomposición polarimétrica completa ni modelos físicos de inversión.

## Enlaces directos

La visualización acepta parámetros por URL:

- Bosque con volumen en VH/C: `?cover=forest&pol=VH&band=C&volume=80`
- Infraestructura con doble rebote HH/L: `?cover=urban&pol=HH&band=L&volume=75&structure=90`
- Cultivos en VV/X: `?cover=crops&pol=VV&band=X&volume=60&structure=70`

## Fuentes consultadas

- NASA NISAR, “Get to Know SAR”: https://science.nasa.gov/mission/nisar/get-to-know-sar/
- NASA ARSET, SAR training resources: https://appliedsciences.nasa.gov/join-mission/training/english/arset
- ASF HyP3, “Introduction to SAR”: https://hyp3-docs.asf.alaska.edu/hyp3-docs/guides/introduction_to_sar/
- ESA, “Some Basic Radar Principles”: https://www.esa.int/esapub/sp/sp1199/get21.htm
