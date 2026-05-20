-- 0022: descripciones enriquecidas con keywords (marcas + MCC + dominio).
-- Mejora similitud trigram de pg_trgm para sugerencias de recategorización.
-- Idempotente: UPDATE por slug, seguro de reaplicar.

UPDATE categorias SET descripcion = 'Agropecuario, agrícola, ganadero, campo, maquinaria agrícola, fertilizantes, semillas, insumos rurales, veterinario rural, silos, tractor', updated_at = now() WHERE slug = 'agro';
UPDATE categorias SET descripcion = 'Despensa, almacén, minimarket, bodega, panadería, confitería, heladería, lácteos, bebidas, cerveza, vino, licor, amandau, grido, chiperia, mburucuya', updated_at = now() WHERE slug = 'alimentacion';
UPDATE categorias SET descripcion = 'Repuestos, cubiertas, baterías, lavadero, taller mecánico, autopartes, vehículos, motos, lubricantes, llantas, accesorios automotor', updated_at = now() WHERE slug = 'automotor';
UPDATE categorias SET descripcion = 'Casino, apuestas deportivas, tragamonedas, slots, quiniela, juegos de azar, betsat, solbet, giro win, bingo, lotería', updated_at = now() WHERE slug = 'azar';
UPDATE categorias SET descripcion = 'Salones de belleza, estética, peluquería, barbería, cosméticos, manicura, pedicura, depilación, spa, maquillaje, uñas, peinados', updated_at = now() WHERE slug = 'belleza';
UPDATE categorias SET descripcion = 'Cafetería, café, expresso, capuccino, té, brunch, panadería de café, coffee shop', updated_at = now() WHERE slug = 'cafeteria';
UPDATE categorias SET descripcion = 'Estación de servicio, gasolinera, nafta, gasoil, diesel, combustible, lubricantes, aceite, petrobras, shell, esso, puma, copetrol, barcos y rodados', updated_at = now() WHERE slug = 'combustible';
UPDATE categorias SET descripcion = 'Tienda general, comercio minorista, multiproducto, retail, venta variada, mercadería diversa', updated_at = now() WHERE slug = 'comercial';
UPDATE categorias SET descripcion = 'Ferretería, materiales de construcción, herramientas, pintura, cemento, ladrillos, hierro, sanitarios, plomería, electricidad obra, corralón', updated_at = now() WHERE slug = 'construccion';
UPDATE categorias SET descripcion = 'Bitcoin, ethereum, criptomonedas, exchange, wallet, binance, blockchain, trading cripto, defi, stablecoins', updated_at = now() WHERE slug = 'cripto';
UPDATE categorias SET descripcion = 'Gimnasio, fitness, canchas, club deportivo, fútbol, padel, tenis, ciclismo, indumentaria deportiva, suplementos, running, natación', updated_at = now() WHERE slug = 'deportes';
UPDATE categorias SET descripcion = 'Colegio, universidad, escuela, instituto, jardín de infantes, cursos, capacitación, libros educativos, papelería escolar, matrícula, cuotas', updated_at = now() WHERE slug = 'educacion';
UPDATE categorias SET descripcion = 'Streaming, cine, teatro, conciertos, recitales, netflix, spotify, disney, hbo, amazon prime, parques de diversiones, juguetes, juegos, música, eventos', updated_at = now() WHERE slug = 'entretenimiento';
UPDATE categorias SET descripcion = 'Farmacia, droguería, botica, medicamentos, remedios, perfumería farmacia, salud, punto farma, catedral, farmacenter, bristol, farma oliva, farmatotal', updated_at = now() WHERE slug = 'farmacia';
UPDATE categorias SET descripcion = 'Banco, financiera, préstamos, créditos, transferencias bancarias, divisas, cambio de moneda, inversiones, valores, títulos, corretaje, fintech', updated_at = now() WHERE slug = 'financiero';
UPDATE categorias SET descripcion = 'Florería, flores, ramos, arreglos florales, plantas, vivero, decoración floral, regalos florales', updated_at = now() WHERE slug = 'floreria';
UPDATE categorias SET descripcion = 'Funeraria, velatorio, sepelio, féretro, cremación, cementerio, servicios fúnebres, panteón, nicho', updated_at = now() WHERE slug = 'funeraria';
UPDATE categorias SET descripcion = 'Muebles, decoración hogar, electrodomésticos, blanquería, cocina, jardín, piscinas, ferretería hogar, tapicería, ropa de cama, ollas, vajilla, alfombrados, pinturas', updated_at = now() WHERE slug = 'hogar';
UPDATE categorias SET descripcion = 'Inmobiliaria, bienes raíces, casas, departamentos, alquileres, ventas inmuebles, propiedades, terrenos, alquiler vivienda, administración edificios', updated_at = now() WHERE slug = 'inmobiliaria';
UPDATE categorias SET descripcion = 'Librería, papelería, libros, útiles escolares, oficina, cuadernos, lapiceras, papel, cartulinas, material escolar', updated_at = now() WHERE slug = 'libreria';
UPDATE categorias SET descripcion = 'Pet shop, veterinaria, alimento balanceado, comida para perros y gatos, accesorios mascotas, peluquería canina, juguetes mascotas', updated_at = now() WHERE slug = 'mascotas';
UPDATE categorias SET descripcion = 'Diarios, prensa, periódicos, revistas, suscripción medios, noticias, abc color, última hora', updated_at = now() WHERE slug = 'medios';
UPDATE categorias SET descripcion = 'Óptica, anteojos, gafas, lentes graduados, lentes de sol, contactos, optometría, monturas', updated_at = now() WHERE slug = 'optica';
UPDATE categorias SET descripcion = 'Misceláneos, regalos, novedades, donaciones, ONG, caridad, varios, no clasificado, artesanías, importados', updated_at = now() WHERE slug = 'otros';
UPDATE categorias SET descripcion = 'Parroquia, iglesia, templo, artículos religiosos, donaciones religiosas, sacramentos, congregación, retiro espiritual', updated_at = now() WHERE slug = 'religioso';
UPDATE categorias SET descripcion = 'Restaurante, bar, parrilla, pizzería, hamburguesería, comida rápida, lomitería, delivery comida, burger king, mc donalds, kfc, pizza hut, delipollo', updated_at = now() WHERE slug = 'restaurante';
UPDATE categorias SET descripcion = 'Indumentaria, ropa, calzado, zapatos, zapatería, accesorios moda, joyería, relojería, moda, vestimenta, talles, sportswear, uniformes', updated_at = now() WHERE slug = 'ropa';
UPDATE categorias SET descripcion = 'Médico, doctor, dentista, hospital, clínica, laboratorio análisis, análisis clínicos, ortopedia, kinesiología, terapia, consulta médica, spa salud, masajes', updated_at = now() WHERE slug = 'salud';
UPDATE categorias SET descripcion = 'Compañías de seguros, póliza, cobertura, seguro de auto, seguro de vida, seguro de salud, seguro hogar, prima', updated_at = now() WHERE slug = 'seguros';
UPDATE categorias SET descripcion = 'Telefonía, internet, cable, electricidad, agua, gas, impuestos, multas, gobierno, ande, essap, copaco, tigo, claro, personal, limpieza, contabilidad, servicios profesionales, telecomunicaciones', updated_at = now() WHERE slug = 'servicios';
UPDATE categorias SET descripcion = 'Supermercado, hipermercado, mayorista, autoservicio, biggie, real, stock, salemma, superseis, casa rica, area uno, los jardines, nuestra casa, grandes tiendas, víveres', updated_at = now() WHERE slug = 'supermercado';
UPDATE categorias SET descripcion = 'Cigarrillos, tabaco, vapes, vaper, cigarros, productos tabaco, cigarrillería, narguile', updated_at = now() WHERE slug = 'tabaco';
UPDATE categorias SET descripcion = 'Computadoras, notebooks, celulares, smartphones, tablets, software, apps, electrónica, hardware, accesorios tecnológicos, gadgets, equipos de telecomunicación', updated_at = now() WHERE slug = 'tecnologia';
UPDATE categorias SET descripcion = 'Transferencia entre personas, P2P, mango, envío de dinero, pagos personales, giros, persona a persona', updated_at = now() WHERE slug = 'transferencia';
UPDATE categorias SET descripcion = 'Taxi, uber, bolt, muv, remis, ómnibus, colectivo, peaje, estacionamiento, transporte público, viaje urbano, transporte cargas', updated_at = now() WHERE slug = 'transporte';
UPDATE categorias SET descripcion = 'Aerolíneas, vuelos, hoteles, hospedaje, alojamiento, agencia de viajes, alquiler de autos, cruceros, turismo, paquetes turísticos, booking, despegar, american airlines, copa, iberia, tam', updated_at = now() WHERE slug = 'viajes';
