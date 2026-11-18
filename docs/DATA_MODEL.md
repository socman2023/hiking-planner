# Hiking Planner — модель данных (проект 0.1)

**Статус:** логическая схема для реализации; это не готовая миграция IndexedDB. Первые реальные типы создаются на этапе 1.  
**Подход:** нормализованные сущности с локальными устойчивыми UUID, производные данные не храним без необходимости, связи между походом и библиотекой — по ID.

## 1. Общие соглашения

- `id`: UUID (для независимого экспорта, импорта и будущей синхронизации).
- `createdAt` / `updatedAt`: ISO datetime в UTC; пользовательская календарная дата `YYYY-MM-DD` отдельно.
- `tripId`: ссылка на поход; `dayId`: ссылка на конкретный день; реальный порядок вычисляется по дате, а не по надписи «день N».
- Масса — `g` (число, допустимы дроби); объём — `ml`; энергия — `kcal`; длина — `m`; координаты WGS84 в десятичных градусах.
- БЖУ хранить в граммах **на 100 г конкретной формы продукта**; `basis`: dry / ready / as_packaged / unknown.
- Суммы денег — целые `minorUnits` и `currency` (ISO 4217); не смешивать разные валюты при суммировании без конверсии.
- Значение `null` означает «неизвестно». Ноль означает измеренное/явно введённое нулевое значение; разница критична.
- Все сетевые карточки имеют происхождение: URL / провайдер / дата загрузки / дата ручной проверки / тип лицензии. Не подтверждать «верно» автоматически.

## 2. Ядро похода — первая миграция

### Trip
`id, title, regionLabel?, activityType, startDate, dayCount, status (draft|planned|completed|archived), notes?, createdAt, updatedAt`

У одиночного похода нет обязательного поля `participants[]`. Возможность добавления участников — будущая миграция.

### TripDay
`id, tripId, date, kind (hiking|logistics|rest|other), title?, description?, plannedWalkingMinutes?, notes?`

Ограничение: в одном походе на одну дату — одна запись TripDay. Дни создаются/удаляются согласованно с изменением Trip.dayCount. Для переходов нужна отдельная сущность.

### TripEvent
`id, tripId, dayId, startLocal?, endLocal?, title, category, description?, locationRef?`

Проверять пересечение временных интервалов с учётом локального часового пояса похода.

### RouteTrack
`id, tripId, name, formatOrigin (drawn|gpx|geojson), geometryRef, sourceRef?, visibility, notes?`

`geometryRef` указывает на локально сохранённую LineString/MultiLineString либо большой blob, а не на чужой URL без резервной копии.

### RouteWaypoint
`id, tripId, dayId?, trackId?, lat, lon, elevationM?, type, name, description?, sourceRef?, observationDate?`

Походная точка — копия/ссылка на объект библиотеки; редактирование точки не должно незаметно менять справочник всех объектов.

### RouteSegment
`id, tripId, dayId, order, fromWaypointId?, toWaypointId?, trackId?, plannedDistanceM?, plannedAscentM?, plannedDescentM?, estimatedWalkingMinutes?, surface?, notes?`

Часть геометрии может принадлежать нескольким дневным сегментам. В модели важно хранить границы и порядок.

### TripTransportLeg
`id, tripId, fromText, toText, departureLocal?, arrivalLocal?, timeZone?, mode, provider?, serviceNumber?, priceMinor?, currency?, status, bookingRef?, sourceRef?, notes?`

Валидация стыковок возможна только при точном времени и согласованных часовых поясах.

### TripExpense
`id, tripId, category, title, plannedMinor?, factState (unknown|not_spent|recorded), actualMinor?, currency, paidAt?, priceSourceRef?, notes?`

`factState=unknown` ⇒ фактическая сумма `null`; `not_spent` ⇒ 0; `recorded` ⇒ задано конкретное значение (включая 0 если ввод подтверждён).

## 3. Каталог продуктов и питание

### FoodProduct
`id, name, brand?, category, barcode?, form (dry|ready|as_packaged|unknown), edibleBasisDescription?, kcalPer100g?, proteinPer100g?, fatPer100g?, carbsPer100g?, sodiumMgPer100g?, allergens?, shelfLifeDays?, ingredientsText?, sourceRef?, reviewedAt?, notes?`

Химико-энергетическая непротиворечивость проверяется как предупреждение, а не автоматическое исправление (этикетки могут иметь округления).

### FoodPackageVariant
`id, foodProductId, label?, netWeightG?, packageWeightG?, grossWeightG?, portionCount?, volumeMl?, barcode?, packageType?, shelfLifeDate?, sourceRef?`

`grossWeightG` может задаваться фактически, иначе вычисляться из известных net + package. Без данных не подставлять 0.

### PriceObservation
`id, targetType, targetId, amountMinor, currency, observedAt, seller?, country?, url?, unit?, sourceRef?, note?`

Хранить историю цен; актуальную «ориентировочную» цену выбирать явно, не затирать предыдущую.

### Dish
`id, title, category?, instruction?, cookingWaterMl?, cookingTimeMin?, cookingMethod?, sourceRef?, notes?`

### DishIngredient
`id, dishId, productId, rawAmountG, optional?, substitutionGroup?, notes?`

Блюдо не копирует вручную БЖУ каждого ингредиента, если они есть в библиотеке. Для готовых брендированных пакетов допустимо блюдо без отдельных ингредиентов со ссылкой на готовый FoodProduct.

### TripMeal
`id, tripId, dayId, slotKey, label?, order, notes?`

`slotKey` произвольный (завтрак, перекус, ужин и собственные названия), не жёстко четыре категории.

### TripMealItem
`id, tripMealId, kind (product|dish), productId?, dishId?, amountG?, portions?, packageVariantId?, overrides?, notes?`

При добавлении в меню фиксировать необходимые контекстные параметры (количество/вес, основание расчёта); если библиотека позже изменяется, показать возможность пересчёта, а не менять прошлый план неожиданно.

### TripProvisionPlan
`id, tripId, productId, selectedPackageVariantId?, purchaseOverrideQty?, stockOnHandG?, carryPackaging?, notes?`

Закупка — производная из плана питания с учётом складского остатка и выбора фасовки. Не дублировать итоговые граммы в хранении без пометки версии вычисления.

### FuelPlan
`id, tripId, fuelType, canisterNetFuelG?, fullCanisterGrossG?, canisterTareG?, baselineConsumptionG?, reservePct?, assumptions, notes?`

Расход газа зависит от числа готовок, объёма кипячения, устройства и условий, а не напрямую от массы порции. Фактическая модель расхода должна быть явно редактируема.

## 4. Снаряжение

### GearCatalogItem
`id, name, brand?, model?, category, manufacturerWeightG?, specsJson?, imageAssetId?, sourceRef?, notes?`

Характеристики типизированы по категориям (например, T-comfort спальника, мощность прибора, вместимость палатки), при этом `specsJson` валидируется схемой категории.

### OwnedGearItem
`id, catalogItemId?, nickname?, measuredWeightG?, condition?, quantityOwned?, customNotes?`

Это конкретный экземпляр владельца; может существовать без онлайн-каталожной карточки.

### TripGearItem
`id, tripId, ownedGearId?, catalogItemId?, titleSnapshot, weightOverrideG?, qty, placement (pack|worn|consumable), included, packingStatus (todo|staged|packed), optional, storage?, notes?`

Расчётный вес = `(weightOverrideG ?? measuredWeightG ?? manufacturerWeightG) * qty`; отсутствие всех масс — состояние «неизвестно», а не ноль. Разделение места переноски и статуса сборов обязательно.

## 5. Медицинский справочник и аптечка

### MedicalCatalogItem
`id, kind (medicine|device), tradeName, internationalName?, activeIngredients?, dosageForm?, strength?, manufacturer?, storageRequirements?, approvedInstructionUrl?, instructionVersion?, instructionFetchedAt?, sourceRef?, notes?`

Для изделий: стерильность, размеры, тип изделия, инструкция производителя, упаковка и условия хранения.

### OwnedMedicalPack
`id, catalogItemId, label?, packageQuantity, unit, expiryDate?, lotNumber?, actualWeightG?, acquiredAt?, note?`

Дата годности относится к **реально имеющейся упаковке**, не к типу препарата. При покупке замены требуется новая фактическая дата; приложение не её придумывает.

### TripMedicalItem
`id, tripId, ownedMedicalPackId?, catalogItemId, qty, unit, packingStatus, useNotes?, sourceSnapshotRef?`

Проверка на истечение срока — по дате окончания похода; неизвестный срок даёт `unknown`. Упоминание взаимодействий — информационное предупреждение и ссылка на источник, не «разрешено/запрещено».

## 6. Библиотека геообъектов, материалов и происхождение

### GeoPlace
`id, name, kind, lat, lon, elevationM?, region?, description?, observedAt?, sourceRef?, notes?`

### SourceRecord
`id, provider, url?, title?, author?, retrievedAt?, publishedAt?, observedAt?, licence?, attributionText?, usageRestrictions?, reliability (unreviewed|source_recorded|user_verified), reviewedAt?, rawExternalId?, notes?`

Отдельная таблица сохраняет происхождение как для реестров лекарств, так и для оборудования, продуктов и маршрутов.

### MediaAsset
`id, kind (image|document|gpx|geojson|other), localBlobKey?, remoteUrl?, sourceRef?, mimeType, sizeBytes?, originalName?, caption?, rights?, createdAt`

Сетевой URL не гарантирует офлайн-доступ. Размер и лицензию изображения проверяем при сохранении локальной копии.

### MaterialLink
`id, targetType, targetId, mediaAssetId?, sourceRef?, relation (illustration|instruction|trip_report|reference|track|other), note?`

Позволяет привязывать фотографии, инструкции и отчёты к объекту, участку, походу, товару.

### WeatherSnapshot
`id, tripId, waypointId?, lat, lon, elevationM?, forDateTime, dataType (forecast|historical|climatology), retrievedAt, provider, variables, sourceRef?`

Актуальный прогноз не интерпретируется как климатическая норма, и наоборот. Место и дата обязательны.

## 7. Производные показатели (не отдельные таблицы)

| Показатель | Расчёт |
|---|---|
| Энергия продукта, ккал | `kcalPer100g × edibleGrams / 100` |
| БЖУ порции | Каждый нутриент `per100g × edibleGrams / 100` |
| Рацион дня | Сумма позиций привязанных к TripDay через TripMeal |
| Сухой вес снаряжения | Сумма включённых нерасходных предметов; показывать разбивку по placement |
| Вес рюкзака на старте | Включённые `pack` + `consumable`; `worn` отдельно |
| Количество упаковок | `ceil(max(0, needG - stockG) / netWeightG)`; неизвестная фасовка ⇒ «не вычислено» |
| План бюджета | Сумма по одной валюте и только известным значениям |
| Факт бюджета | Сумма записанных фактических расходов; неизвестные показывать отдельно |
| Количество ходовых дней | `count(TripDay.kind === hiking)` |
| Индекс готовности | Понятная агрегированная метрика без утверждения «поход безопасен» |
| Средний калораж | Сумма ккал выбранных дней / число дней, с явно обозначенным знаменателем |

### Пример: две упаковки одного блюда

Продукт «каша» имеет `kcalPer100g = 400` и две фасовки — 50 и 80 г. Меню требует 130 г → 520 ккал. При выборе 80-граммовой фасовки закупка = 2 пакета и 160 г нетто; несъеденные 30 г не исчезают из массы автоматически. Масса упаковки добавляется к массе для переноски при известном значении. Все это отдельные величины.

## 8. Индексы и целостность

Рекомендуемые индексы:
- `TripDay`: `[tripId+date]` уникальный;
- `TripMeal`: `[tripId+dayId]`;
- `TripMealItem`: `tripMealId`;
- `TripGearItem`, `TripMedicalItem`, `TripExpense`: `tripId`;
- `FoodPackageVariant`: `foodProductId`;
- `DishIngredient`: `dishId`;
- `RouteWaypoint`, `RouteSegment`: `tripId`, `dayId`;
- `SourceRecord`: `[provider+rawExternalId]` там, где внешние ID устойчивы;
- `PriceObservation`: `[targetType+targetId]`.

IndexedDB не обеспечивает внешних ключей как SQL; целостность ссылок обеспечивается транзакциями репозиториев и тестами. Удаление библиотечного объекта, используемого в походах, требует предпросмотра затрагиваемых записей.

## 9. Миграции и порядок внедрения

**Migration 1 / Этап 1:** Trip, TripDay, пользовательские настройки, резервный экспорт/импорт, базовые CRUD и тесты.  
**Далее:** библиотека товаров и походные связи; потом питание; затем маршруты и источники; потом аптечка, бюджет, транспорт и погода.

Не создавать все таблицы заранее только ради полноты схемы. Контракт каждой сущности уточняется тестами перед реализацией. Групповые Participant и SharedExpense исключены из ранней схемы.
