import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$connect();
  console.log("🗑️ Очистка старых направлений в Learning Platform...");

  // Так как курсы каскадно связаны с направлениями, удаление направлений
  // очистит старые данные, чтобы начать с чистого листа.
  await prisma.direction.deleteMany();

  const DIRECTIONS = [
    { title: "Гитара", slug: "guitar", description: "Уроки гитары в Maestro" },
    { title: "Электрогитара", slug: "electric-guitar", description: "Уроки электрогитары в Maestro" },
    { title: "Басгитара", slug: "bass-guitar", description: "Уроки бас-гитары в Maestro" },
    { title: "Вокал", slug: "vocal", description: "Уроки вокала в Maestro" },
    { title: "Фортепиано", slug: "piano", description: "Уроки фортепиано в Maestro" },
    { title: "Укулеле", slug: "ukulele", description: "Уроки укулеле в Maestro" },
  ];

  console.log("🎨 Создание 6 официальных направлений в Learning Platform...");
  for (const dir of DIRECTIONS) {
    await prisma.direction.create({
      data: {
        title: dir.title,
        slug: dir.slug,
        description: dir.description,
        isPublished: true,
      },
    });
    console.log(`✅ Направление создано: ${dir.title}`);
  }

  console.log("🏁 Инициализация направлений в Learning Platform успешно завершена!");
}

main()
  .catch((error) => {
    console.error("❌ Ошибка:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
