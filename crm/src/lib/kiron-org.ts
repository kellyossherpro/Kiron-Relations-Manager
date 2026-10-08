// Kiron's departments and people, from the organogram Kelly shared on 2026-10-08. Names, job titles
// and who each person reports to only: never email addresses or phone numbers (CLAUDE.md).
// People are matched to their Microsoft account when they first sign in.
// Still to come: Sales, Account Management, Finance, Legal, Compliance, Marketing, Product, management.

export type OrgPerson = { name: string; title: string; reportsTo: string };
export type OrgDepartment = { name: string; people: OrgPerson[] };

export const KIRON_ORG: OrgDepartment[] = [
  {
    name: "Development (Betman)",
    people: [
      { name: "Anthony Snell", title: "Intermediate Software Developer", reportsTo: "Oswald Whelpton" },
      { name: "Donevon Viljoen", title: "Senior Software Developer", reportsTo: "Oswald Whelpton" },
      { name: "Evan Ernest Malherbe", title: "Intermediate Software Developer", reportsTo: "Leandi Hill" },
      { name: "Gresham Moopanar", title: "Intermediate DevOps Engineer", reportsTo: "Zipho Zwane" },
      { name: "Guy Phillips", title: "Senior Software Developer", reportsTo: "Oswald Whelpton" },
      { name: "Jean-Jaques De Kock", title: "Intermediate Software Developer", reportsTo: "Leandi Hill" },
      { name: "Kirusha Pillay", title: "BI Data Analyst", reportsTo: "Oswald Whelpton" },
      { name: "Leandi Hill", title: "Team Lead: Software Development", reportsTo: "Oswald Whelpton" },
      { name: "Oswald Whelpton", title: "Software Development Manager", reportsTo: "Jason Pretorius" },
      { name: "Ravi Ramnath", title: "Senior Solutions Architect Engineer", reportsTo: "Oswald Whelpton" },
      { name: "Siphiwe Mukavela", title: "Data Engineer", reportsTo: "Oswald Whelpton" },
      { name: "Stefan Carstens", title: "Senior Full Stack Developer", reportsTo: "Leandi Hill" },
      { name: "Zipho Zwane", title: "Senior DevOps Engineer", reportsTo: "Oswald Whelpton" },
    ],
  },
  {
    name: "Support & Installations",
    people: [
      { name: "Antonio Mosolodi", title: "Support and Installations Technician", reportsTo: "Tebatso Letsoalo" },
      { name: "Azwianewi Siaga", title: "Support and Installations Technician", reportsTo: "Chazlyn Booysen" },
      { name: "Camilo Bassil", title: "Support & Installations Technician", reportsTo: "Nkosana Phiri" },
      { name: "Chazlyn Booysen", title: "Installations Manager", reportsTo: "Darren Kessel" },
      { name: "Daniel van den Heever", title: "Support and Installations Technician", reportsTo: "Nkosana Phiri" },
      { name: "Darren Kessel", title: "Head of IT Services", reportsTo: "Justin Frost" },
      { name: "Hernan Montoya", title: "Technical Product Trainer", reportsTo: "Nkosana Phiri" },
      { name: "Kefentse Ignatius Tlab…", title: "Junior Network Administrator", reportsTo: "Thabiso Mfumadi" }, // surname cut off: ask Kelly
      { name: "Luyanda Thenjwayo", title: "Support and Installations Technician", reportsTo: "Tebatso Letsoalo" },
      { name: "Marlon Roux", title: "Customer Service Agent", reportsTo: "Nkosana Phiri" },
      { name: "Mxolisi Vilakazi", title: "Support and Installations Technician", reportsTo: "Nkosana Phiri" },
      { name: "Nkosana Phiri", title: "Support Team Lead", reportsTo: "Vimbai Chitanda" },
      { name: "Nkululeko Doko", title: "Support and Installations Technician", reportsTo: "Nkosana Phiri" },
      { name: "Quinton Roux", title: "Customer Service Agent", reportsTo: "Nkosana Phiri" },
      { name: "Rowland Higgs", title: "Systems Manager", reportsTo: "Darren Kessel" },
      { name: "Tebatso Letsoalo", title: "Team Lead: Installations", reportsTo: "Chazlyn Booysen" },
      { name: "Thabiso Mfumadi", title: "Senior Network Administrator", reportsTo: "Darren Kessel" },
      { name: "Thabo Thoka", title: "Senior Support & Installation Engineer", reportsTo: "Nkosana Phiri" },
      { name: "Vimbai Chitanda", title: "Support Manager", reportsTo: "Darren Kessel" },
    ],
  },
  {
    name: "Animation",
    people: [
      { name: "Anton Peter Swanepoel", title: "Look Development Artist", reportsTo: "George Christacopoulos" },
      { name: "George Christacopoulos", title: "Art Director", reportsTo: "Paul Louis Meyer" },
      { name: "Jawid Khan", title: "Junior Software Developer", reportsTo: "Matt Lowery" },
      { name: "Jeremy Lainé", title: "Senior Game Designer", reportsTo: "Matt Lowery" },
      { name: "Kyron Oliver", title: "Senior Producer", reportsTo: "Matt Lowery" },
      { name: "Martin Grabarski", title: "Senior Software Developer", reportsTo: "Matt Lowery" },
      { name: "Martin Heigan", title: "Technical Developer", reportsTo: "Martin Grabarski" },
      { name: "Matt Lowery", title: "Art Director", reportsTo: "George Christacopoulos" },
      { name: "Megan Bennion", title: "Artist", reportsTo: "Matt Lowery" },
      { name: "Mikhyale Somnath", title: "Junior Development Artist", reportsTo: "Matt Lowery" },
      { name: "Odette Beath", title: "Senior Producer", reportsTo: "George Christacopoulos" },
      { name: "Paul Louis Meyer", title: "Creative Director", reportsTo: "Jason Pretorius" },
      { name: "Peter Carrington", title: "Junior Animator", reportsTo: "George Christacopoulos" },
      { name: "Ruan Emanuel Rosslee", title: "Artist", reportsTo: "George Christacopoulos" },
      { name: "Stephan Botha", title: "Technical Artist", reportsTo: "George Christacopoulos" },
    ],
  },
];
