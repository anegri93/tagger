#!/usr/bin/env bash
# Enriquece descripciones de categorías con palabras clave derivadas de
# MCC catalogo + marcas conocidas + conocimiento de dominio. El texto rico
# mejora la similitud trigram (pg_trgm) para sugerencias de recategorización.
#
# Uso: bash scripts/enriquecer-descripciones-cats.sh
# Requiere: API corriendo en localhost:3000 y .env con API_KEY.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then echo "[err] .env no existe"; exit 1; fi
API_KEY=$(grep ^API_KEY .env | cut -d= -f2)
BASE=${BASE:-http://localhost:3000}

patch_cat() {
  local slug="$1"
  local desc="$2"
  local code
  code=$(curl -s -o /tmp/patch_cat.json -w "%{http_code}" \
    -X PATCH "$BASE/categorias/$slug" \
    -H "x-api-key: $API_KEY" \
    -H "content-type: application/json" \
    -d "$(printf '{"descripcion":%s}' "$(printf '%s' "$desc" | jq -Rs .)")")
  if [[ "$code" == "200" ]]; then
    printf '[ok]   %-16s %s\n' "$slug" "${desc:0:80}..."
  else
    printf '[FAIL] %-16s code=%s body=%s\n' "$slug" "$code" "$(cat /tmp/patch_cat.json)"
  fi
}

# Map slug → descripción enriquecida (keywords separadas por coma).
patch_cat agro "Agropecuario, agrícola, ganadero, campo, maquinaria agrícola, fertilizantes, semillas, insumos rurales, veterinario rural, silos, tractor"
patch_cat alimentacion "Despensa, almacén, minimarket, bodega, panadería, confitería, heladería, lácteos, bebidas, cerveza, vino, licor, amandau, grido, chiperia, mburucuya"
patch_cat automotor "Repuestos, cubiertas, baterías, lavadero, taller mecánico, autopartes, vehículos, motos, lubricantes, llantas, accesorios automotor"
patch_cat azar "Casino, apuestas deportivas, tragamonedas, slots, quiniela, juegos de azar, betsat, solbet, giro win, bingo, lotería"
patch_cat belleza "Salones de belleza, estética, peluquería, barbería, cosméticos, manicura, pedicura, depilación, spa, maquillaje, uñas, peinados"
patch_cat cafeteria "Cafetería, café, expresso, capuccino, té, brunch, panadería de café, coffee shop"
patch_cat combustible "Estación de servicio, gasolinera, nafta, gasoil, diesel, combustible, lubricantes, aceite, petrobras, shell, esso, puma, copetrol, barcos y rodados"
patch_cat comercial "Tienda general, comercio minorista, multiproducto, retail, venta variada, mercadería diversa"
patch_cat construccion "Ferretería, materiales de construcción, herramientas, pintura, cemento, ladrillos, hierro, sanitarios, plomería, electricidad obra, corralón"
patch_cat cripto "Bitcoin, ethereum, criptomonedas, exchange, wallet, binance, blockchain, trading cripto, defi, stablecoins"
patch_cat deportes "Gimnasio, fitness, canchas, club deportivo, fútbol, padel, tenis, ciclismo, indumentaria deportiva, suplementos, running, natación"
patch_cat educacion "Colegio, universidad, escuela, instituto, jardín de infantes, cursos, capacitación, libros educativos, papelería escolar, matrícula, cuotas"
patch_cat entretenimiento "Streaming, cine, teatro, conciertos, recitales, netflix, spotify, disney, hbo, amazon prime, parques de diversiones, juguetes, juegos, música, eventos"
patch_cat farmacia "Farmacia, droguería, botica, medicamentos, remedios, perfumería farmacia, salud, punto farma, catedral, farmacenter, bristol, farma oliva, farmatotal"
patch_cat financiero "Banco, financiera, préstamos, créditos, transferencias bancarias, divisas, cambio de moneda, inversiones, valores, títulos, corretaje, fintech"
patch_cat floreria "Florería, flores, ramos, arreglos florales, plantas, vivero, decoración floral, regalos florales"
patch_cat funeraria "Funeraria, velatorio, sepelio, féretro, cremación, cementerio, servicios fúnebres, panteón, nicho"
patch_cat hogar "Muebles, decoración hogar, electrodomésticos, blanquería, cocina, jardín, piscinas, ferretería hogar, tapicería, ropa de cama, ollas, vajilla, alfombrados, pinturas"
patch_cat inmobiliaria "Inmobiliaria, bienes raíces, casas, departamentos, alquileres, ventas inmuebles, propiedades, terrenos, alquiler vivienda, administración edificios"
patch_cat libreria "Librería, papelería, libros, útiles escolares, oficina, cuadernos, lapiceras, papel, cartulinas, material escolar"
patch_cat mascotas "Pet shop, veterinaria, alimento balanceado, comida para perros y gatos, accesorios mascotas, peluquería canina, juguetes mascotas"
patch_cat medios "Diarios, prensa, periódicos, revistas, suscripción medios, noticias, abc color, última hora"
patch_cat optica "Óptica, anteojos, gafas, lentes graduados, lentes de sol, contactos, optometría, monturas"
patch_cat otros "Misceláneos, regalos, novedades, donaciones, ONG, caridad, varios, no clasificado, artesanías, importados"
patch_cat religioso "Parroquia, iglesia, templo, artículos religiosos, donaciones religiosas, sacramentos, congregación, retiro espiritual"
patch_cat restaurante "Restaurante, bar, parrilla, pizzería, hamburguesería, comida rápida, lomitería, delivery comida, burger king, mc donalds, kfc, pizza hut, delipollo"
patch_cat ropa "Indumentaria, ropa, calzado, zapatos, zapatería, accesorios moda, joyería, relojería, moda, vestimenta, talles, sportswear, uniformes"
patch_cat salud "Médico, doctor, dentista, hospital, clínica, laboratorio análisis, análisis clínicos, ortopedia, kinesiología, terapia, consulta médica, spa salud, masajes"
patch_cat seguros "Compañías de seguros, póliza, cobertura, seguro de auto, seguro de vida, seguro de salud, seguro hogar, prima"
patch_cat servicios "Telefonía, internet, cable, electricidad, agua, gas, impuestos, multas, gobierno, ande, essap, copaco, tigo, claro, personal, limpieza, contabilidad, servicios profesionales, telecomunicaciones"
patch_cat supermercado "Supermercado, hipermercado, mayorista, autoservicio, biggie, real, stock, salemma, superseis, casa rica, area uno, los jardines, nuestra casa, grandes tiendas, víveres"
patch_cat tabaco "Cigarrillos, tabaco, vapes, vaper, cigarros, productos tabaco, cigarrillería, narguile"
patch_cat tecnologia "Computadoras, notebooks, celulares, smartphones, tablets, software, apps, electrónica, hardware, accesorios tecnológicos, gadgets, equipos de telecomunicación"
patch_cat transferencia "Transferencia entre personas, P2P, mango, envío de dinero, pagos personales, giros, persona a persona"
patch_cat transporte "Taxi, uber, bolt, muv, remis, ómnibus, colectivo, peaje, estacionamiento, transporte público, viaje urbano, transporte cargas"
patch_cat viajes "Aerolíneas, vuelos, hoteles, hospedaje, alojamiento, agencia de viajes, alquiler de autos, cruceros, turismo, paquetes turísticos, booking, despegar, american airlines, copa, iberia, tam"

echo "[done] descripciones enriquecidas"
