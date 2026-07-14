import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, inventoryItems, shifts, tasks, messages, recipes, planningCards, dailyReports } from '@/lib/db/schema';
import bcrypt from 'bcryptjs';

export async function POST() {
  try {
    // Clear tables first
    await db.delete(planningCards);
    await db.delete(dailyReports);
    await db.delete(recipes);
    await db.delete(messages);
    await db.delete(tasks);
    await db.delete(shifts);
    await db.delete(inventoryItems);
    await db.delete(users);

    // Create employer
    const employerHash = await bcrypt.hash('admin123', 10);
    const [employer] = await db.insert(users).values({
      name: 'Eva Zelenková',
      email: 'eva@cajovna.cz',
      passwordHash: employerHash,
      role: 'employer',
      avatar: '👩‍💼',
      jobTitle: 'Majitelka',
    }).returning();

    // Create employees
    const empHash = await bcrypt.hash('heslo123', 10);
    const employeeData = [
      { name: 'Jana Nováková', email: 'jana@cajovna.cz', avatar: '👩', jobTitle: 'Baristka', shiftPreference: 'morning' as const },
      { name: 'Tomáš Procházka', email: 'tomas@cajovna.cz', avatar: '👨', jobTitle: 'Barista', shiftPreference: 'afternoon' as const },
      { name: 'Lucie Dvořáková', email: 'lucie@cajovna.cz', avatar: '👩', jobTitle: 'Baristka', shiftPreference: 'morning' as const },
      { name: 'Martin Kovář', email: 'martin@cajovna.cz', avatar: '👨', jobTitle: 'Pomocný personál', shiftPreference: 'flexible' as const },
    ];

    const createdEmployees = await db.insert(users).values(
      employeeData.map(e => ({
        ...e,
        passwordHash: empHash,
        role: 'employee' as const,
        employerId: employer.id,
      }))
    ).returning();

    // Seed inventory
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    await db.insert(inventoryItems).values([
      { name: 'Zelený čaj Sencha', category: 'Čaje', quantity: 850, minQuantity: 500, maxQuantity: 2000, unit: 'g', supplier: 'TeaWorld s.r.o.' },
      { name: 'Pu-erh čaj', category: 'Čaje', quantity: 320, minQuantity: 400, maxQuantity: 1500, unit: 'g', supplier: 'TeaWorld s.r.o.' },
      { name: 'Rooibos vanilka', category: 'Čaje', quantity: 1100, minQuantity: 300, maxQuantity: 1500, unit: 'g', supplier: 'Bylinkový ráj' },
      { name: 'Šípkový čaj', category: 'Čaje', quantity: 750, minQuantity: 300, maxQuantity: 1500, unit: 'g', supplier: 'Bylinkový ráj' },
      { name: 'Černý čaj Darjeeling', category: 'Čaje', quantity: 450, minQuantity: 400, maxQuantity: 2000, unit: 'g', supplier: 'TeaWorld s.r.o.' },
      { name: 'Matcha premium', category: 'Čaje', quantity: 180, minQuantity: 200, maxQuantity: 500, unit: 'g', supplier: 'JapanTea' },
      { name: 'Med', category: 'Přísady', quantity: 3, minQuantity: 2, maxQuantity: 10, unit: 'kg', supplier: 'Místní včelař' },
      { name: 'Citróny', category: 'Přísady', quantity: 45, minQuantity: 20, maxQuantity: 100, unit: 'ks', supplier: 'FreshFruit' },
      { name: 'Mléko', category: 'Přísady', quantity: 8, minQuantity: 5, maxQuantity: 20, unit: 'l', supplier: 'Mlékárna Stará Louka' },
      { name: 'Kokosový cukr', category: 'Přísady', quantity: 1, minQuantity: 1, maxQuantity: 5, unit: 'kg', supplier: 'BioShop' },
      { name: 'Cukr', category: 'Přísady', quantity: 4, minQuantity: 2, maxQuantity: 10, unit: 'kg', supplier: 'Velkoobchod Praha' },
      { name: 'Papírové sáčky', category: 'Nádobí', quantity: 80, minQuantity: 100, maxQuantity: 500, unit: 'ks', supplier: 'EkoObal' },
      { name: 'Kelímky (250ml)', category: 'Nádobí', quantity: 150, minQuantity: 100, maxQuantity: 500, unit: 'ks', supplier: 'EkoObal' },
      { name: 'Víčka kelímků', category: 'Nádobí', quantity: 90, minQuantity: 100, maxQuantity: 500, unit: 'ks', supplier: 'EkoObal' },
      { name: 'Čajové sítko', category: 'Nádobí', quantity: 12, minQuantity: 5, maxQuantity: 20, unit: 'ks', supplier: 'TeaWorld s.r.o.' },
      { name: 'Svíčky', category: 'Doplňky', quantity: 24, minQuantity: 10, maxQuantity: 50, unit: 'ks', supplier: 'Svíčkárna Morava' },
      { name: 'Ubrousky', category: 'Doplňky', quantity: 5, minQuantity: 3, maxQuantity: 15, unit: 'bal', supplier: 'Velkoobchod Praha' },
    ]);

    // Seed shifts
    const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
    const empIds = createdEmployees.map(e => e.id);

    await db.insert(shifts).values([
      { employeeId: empIds[0], date: fmt(addDays(today, 0)), startTime: '06:00', endTime: '14:00', type: 'morning' },
      { employeeId: empIds[1], date: fmt(addDays(today, 0)), startTime: '14:00', endTime: '22:00', type: 'afternoon' },
      { employeeId: empIds[2], date: fmt(addDays(today, 1)), startTime: '06:00', endTime: '14:00', type: 'morning' },
      { employeeId: empIds[3], date: fmt(addDays(today, 1)), startTime: '14:00', endTime: '22:00', type: 'afternoon' },
      { employeeId: empIds[0], date: fmt(addDays(today, 2)), startTime: '14:00', endTime: '22:00', type: 'afternoon' },
      { employeeId: empIds[1], date: fmt(addDays(today, 2)), startTime: '06:00', endTime: '14:00', type: 'morning' },
      { employeeId: empIds[2], date: fmt(addDays(today, 3)), startTime: '14:00', endTime: '22:00', type: 'afternoon' },
      { employeeId: empIds[0], date: fmt(addDays(today, 4)), startTime: '06:00', endTime: '14:00', type: 'morning' },
      { employeeId: empIds[3], date: fmt(addDays(today, 5)), startTime: '06:00', endTime: '14:00', type: 'morning' },
      { employeeId: empIds[1], date: fmt(addDays(today, 6)), startTime: '14:00', endTime: '22:00', type: 'afternoon' },
    ]);

    // Seed tasks
    await db.insert(tasks).values([
      { title: 'Objednat Pu-erh čaj', description: 'Zásoby Pu-erh čaje jsou pod minimem. Objednat alespoň 500g od TeaWorld s.r.o.', assignedTo: empIds[0], createdBy: employer.id, priority: 'high', status: 'pending', dueDate: fmt(addDays(today, 1)) },
      { title: 'Doplnit papírové sáčky', description: 'Doobjednat papírové sáčky, Matchu a víčka kelímků z EkoObalu.', assignedTo: empIds[3], createdBy: employer.id, priority: 'high', status: 'in_progress', dueDate: fmt(addDays(today, 1)) },
      { title: 'Úklid čajovny', description: 'Důkladný úklid celé čajovny včetně skladu.', assignedTo: empIds[2], createdBy: employer.id, priority: 'medium', status: 'pending', dueDate: fmt(addDays(today, 2)) },
      { title: 'Aktualizovat ceník', description: 'Přidat nové položky do ceníku a tabule.', assignedTo: empIds[0], createdBy: employer.id, priority: 'medium', status: 'pending', dueDate: fmt(addDays(today, 3)) },
      { title: 'Vyfotit nové produkty', description: 'Focení nových čajů pro Instagram a web.', assignedTo: empIds[2], createdBy: employer.id, priority: 'low', status: 'pending', dueDate: fmt(addDays(today, 5)) },
    ]);

    // Seed messages
    await db.insert(messages).values([
      { senderId: empIds[1], channel: 'general', content: 'Dobrý den, dneska jsem nemocný, nemůžu přijít na odpolední směnu. Omlouvám se!' },
      { senderId: employer.id, channel: 'general', content: 'Tomáši, to chápu, uzdrav se brzy. Zkusím zavolat Lucii, jestli může zaskočit.' },
      { senderId: empIds[2], channel: 'general', content: 'Ahoj, mohu přijít, ale potřebuji odejít v 20:00, je to ok?' },
      { senderId: employer.id, channel: 'general', content: 'Perfektní, díky Lucie! Zbytek zvládnu sama.' },
      { senderId: empIds[0], channel: 'general', content: 'Ahoj všichni, upozorňuju že docházejí papírové sáčky. Také Pu-erh čaj je skoro pryč.' },
    ]);

    // Seed recipes
    await db.insert(recipes).values([
      {
        name: 'Klasický zelený čaj',
        description: 'Tradiční příprava zeleného čaje Sencha',
        ingredients: JSON.stringify(['3g Zelený čaj Sencha', '250ml vody']),
        instructions: 'Ohřejte vodu na 75°C. Nasypte čaj do sítka. Nalijte vodu a nechte louhovat 2-3 minuty. Odstraňte sítko.',
        prepTime: 5,
        createdBy: employer.id,
      },
      {
        name: 'Matcha Latte',
        description: 'Prémiový matcha latte s napěněným mlékem',
        ingredients: JSON.stringify(['2g Matcha premium', '50ml horké vody (70°C)', '150ml napěněného mléka', '1 tsp medu (volitelně)']),
        instructions: 'Prosejte matchu přes sítko. Přidejte horkou vodu a dobře rozšlehejte bambusovým metličkou. Napěňte mléko a přidejte k matchě. Ozdobte a podávejte.',
        prepTime: 7,
        createdBy: employer.id,
      },
      {
        name: 'Šípkový čaj s medem',
        description: 'Tradiční šípkový čaj s medem a citrónem',
        ingredients: JSON.stringify(['4g Šípkový čaj', '300ml vody', '1 tsp medu', 'Plátky citrónu']),
        instructions: 'Uvařte vodu na 95°C. Nasypte šípky do sítka. Louhujte 5-7 minut. Přidejte med a plátky citrónu.',
        prepTime: 8,
        createdBy: employer.id,
      },
      {
        name: 'Rooibos Vanilka',
        description: 'Jemný rooibos s vanilkou, bez kofeinu',
        ingredients: JSON.stringify(['3g Rooibos vanilka', '250ml vody', 'Volitelně: mléko nebo med']),
        instructions: 'Uvařte vodu. Louhujte rooibos 5 minut. Rooibos nelze přelouhovat. Přidejte mléko nebo med dle chuti.',
        prepTime: 6,
        createdBy: employer.id,
      },
    ]);

    // Seed planning cards
    await db.insert(planningCards).values([
      { title: 'Čajová degustace', description: 'Organizovat měsíční event pro zákazníky s výběrem prémiových čajů.', column: 'ideas', position: 0, createdBy: employer.id },
      { title: 'Sezónní menu - Léto', description: 'Nové ledové nápoje: Matcha lemonade, Cold brew chai, Hibiscus cooler.', column: 'ideas', position: 1, createdBy: employer.id },
      { title: 'Věrnostní program', description: 'Razítkový kartičkový systém - 10. nápoj zdarma.', column: 'ideas', position: 2, createdBy: employer.id },
      { title: 'Redesign menu tabule', description: 'Nová tabule s krídou na stěně, modernější design.', column: 'in_progress', position: 0, createdBy: employer.id },
      { title: 'Chai Latte recept', description: 'Nový recept chai latte s domácí kořeněnou směsí. Testovat tento týden.', column: 'review', position: 0, createdBy: employer.id },
      { title: 'Instagram profil', description: 'Vytvoření Instagram profilu @cajovnazelen a první příspěvky.', column: 'done', position: 0, createdBy: employer.id },
      { title: 'Letní dekorace', description: 'Výměna zimní dekorace za letní téma.', column: 'done', position: 1, createdBy: employer.id },
    ]);

    // Seed daily reports
    await db.insert(dailyReports).values([
      { date: fmt(addDays(today, -1)), revenue: 4230, customers: 47, notes: 'Klidný den. Zákazníci hodně chválili nový Matcha Latte.', createdBy: employer.id },
      { date: fmt(addDays(today, -2)), revenue: 5870, customers: 62, notes: 'Rušný den, přišel autobus turistů. Docházely kelímky k 20:00.', createdBy: employer.id },
      { date: fmt(addDays(today, -3)), revenue: 3190, customers: 38, notes: 'Klidný den. Ranní směna provedla inventuru skladu.', createdBy: employer.id },
    ]);

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      credentials: {
        employer: { email: 'eva@cajovna.cz', password: 'admin123' },
        employees: employeeData.map(e => ({ email: e.email, password: 'heslo123' })),
      },
    });
  } catch (error: any) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
