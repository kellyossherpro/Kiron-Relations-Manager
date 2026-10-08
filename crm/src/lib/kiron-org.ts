// Kiron's departments and people, from the organogram Kelly shared on 2026-10-08. Names, job titles
// and who each person reports to only: never email addresses or phone numbers (CLAUDE.md).
// People are matched to their Microsoft account when they first sign in.
// Complete as of 2026-10-08: 20 departments, 117 people. One surname still to confirm (Kefentse).

export type OrgPerson = { name: string; title: string; reportsTo?: string };
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
  {
    name: "Development (VSE)",
    people: [
      { name: "Bernhard Röhl", title: "Senior Software Developer", reportsTo: "Craig Jennison" },
      { name: "Craig Jennison", title: "Director of Product and Technology", reportsTo: "Jason Pretorius" },
      { name: "Dennis Mathabatha", title: "QA Manager", reportsTo: "Craig Jennison" },
      { name: "Elena Röhl", title: "Senior Frontend Developer", reportsTo: "Craig Jennison" },
      { name: "Kevin Gregson", title: "Senior Software Developer", reportsTo: "Craig Jennison" },
      { name: "Liam Martin Skerritt", title: "Intermediate Software Developer", reportsTo: "Kevin Gregson" },
      { name: "Mary Mokgokolosi Mofokeng", title: "Software Tester", reportsTo: "Dennis Mathabatha" },
      { name: "Mpho Maimela", title: "Junior Software Tester", reportsTo: "Dennis Mathabatha" },
      { name: "Nicholas Bosman", title: "Intermediate Software Developer", reportsTo: "Craig Jennison" },
      { name: "Yannick Thomas", title: "Technical Product Specialist", reportsTo: "Craig Jennison" },
    ],
  },
  {
    name: "Development - Games",
    people: [
      { name: "Brian Nonyane", title: "Senior Backend Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Dominic Carvalho", title: "Intermediate Software Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Enock Maregere", title: "Senior Backend Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Joaquim Rodrigues", title: "Software Development Manager", reportsTo: "Jason Pretorius" },
      { name: "Kezia Kokosioulis", title: "Intermediate Software Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Lionel Raminhos", title: "Senior Software Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Navin Maharaj", title: "Senior Software Developer", reportsTo: "Joaquim Rodrigues" },
      { name: "Ricardo Costa-Tré", title: "Intermediate Software Developer", reportsTo: "Joaquim Rodrigues" },
    ],
  },
  {
    name: "Design",
    people: [
      { name: "Bhavini Parsotam-Parbhoo", title: "Front - End Web Developer", reportsTo: "Martijn Vreugde" },
      { name: "Martijn Vreugde", title: "Head of Design", reportsTo: "Jason Pretorius" },
    ],
  },
  {
    name: "Product",
    people: [
      { name: "Brandon Pretorius", title: "Product Specialist", reportsTo: "Jason Pretorius" },
      { name: "Jade Sivalingam", title: "Business Analyst", reportsTo: "Joshua Edward Stier" },
      { name: "Joshua Edward Stier", title: "Product Manager", reportsTo: "Jason Pretorius" },
    ],
  },
  {
    name: "People & Culture",
    people: [
      { name: "Bulelwa Tole", title: "People & Culture Officer", reportsTo: "Prashika Murugan" },
      { name: "Jamila Yeki", title: "People & Culture Administrator", reportsTo: "Prashika Murugan" },
      { name: "Kate Dawes", title: "Learning & Development Officer", reportsTo: "Prashika Murugan" },
      { name: "Prashika Murugan", title: "Head of People & Culture", reportsTo: "Steven Spartinos" },
    ],
  },
  {
    name: "QA",
    people: [
      { name: "Carl Dittmer", title: "QA Manager", reportsTo: "Justin Frost" },
      { name: "Caron Audrey Hewitt", title: "Software Tester", reportsTo: "Carl Dittmer" },
      { name: "Ivy Rabetsoe Mokoena", title: "Intermediate Software Tester", reportsTo: "Carl Dittmer" },
      { name: "Ruvona Pillay", title: "Intermediate Software Tester", reportsTo: "Carl Dittmer" },
      { name: "Sandra Tsoka", title: "Software Tester", reportsTo: "Carl Dittmer" },
      { name: "Temoso Hlase", title: "Senior QA tester", reportsTo: "Carl Dittmer" },
      { name: "Tina Groenewald", title: "Senior Software Tester", reportsTo: "Carl Dittmer" },
      { name: "Tsholofelo Mokwena", title: "Senior Software Tester", reportsTo: "Carl Dittmer" },
    ],
  },
  {
    name: "Account Management",
    people: [
      { name: "Dani Alves", title: "Account Manager", reportsTo: "Sarah Cranston" },
      { name: "Dieg Mabamvu", title: "Head of Account Management - Africa", reportsTo: "Sarah Cranston" },
      { name: "Giuseppe Donato", title: "Account Manager", reportsTo: "Sarah Cranston" },
      { name: "Kelly Ossher", title: "Account Management Support Administrator", reportsTo: "Dieg Mabamvu" },
      { name: "Sarah Cranston", title: "Global Head of Account Management", reportsTo: "Feron Lee Somiah" },
      { name: "Tom Maneno", title: "Account Manager", reportsTo: "Dieg Mabamvu" },
      { name: "Tony Maboya", title: "Account Manager", reportsTo: "Dieg Mabamvu" },
      { name: "Valentina Francione", title: "Business Manager", reportsTo: "Sarah Cranston" },
    ],
  },
  {
    name: "Sales",
    people: [
      { name: "Gerald Msimanga", title: "Sales Manager: Africa", reportsTo: "Rob Peché" },
      { name: "Rob Peché", title: "Global Head of Sales", reportsTo: "Feron Lee Somiah" },
      { name: "Sindiso Khupe", title: "Sales Manager: Africa", reportsTo: "Rob Peché" },
    ],
  },
  {
    name: "Sales - North America",
    people: [
      { name: "John Nicastro", title: "First Nations Business Development & Sales", reportsTo: "Robert Miller" },
      { name: "Robert Kowalski", title: "Customer Success Manager: North America", reportsTo: "Robert Miller" },
      { name: "Robert Miller", title: "President USA", reportsTo: "Steven Spartinos" },
    ],
  },
  {
    name: "Commercial",
    people: [
      { name: "Feron Lee Somiah", title: "Director of Commercial Services", reportsTo: "Steven Spartinos" },
    ],
  },
  {
    name: "Marketing",
    people: [
      { name: "Dominique Whittaker", title: "Senior Graphic Designer", reportsTo: "Patrick Eriksen" },
      { name: "Melissa Jaggard", title: "Marketing Operations Manager", reportsTo: "Patrick Eriksen" },
      { name: "Patrick Eriksen", title: "Head of Marketing", reportsTo: "Feron Lee Somiah" },
      { name: "Philip Jonck", title: "Product Marketing Specialist", reportsTo: "Patrick Eriksen" },
      { name: "Teneace Chetty", title: "Marketing Coordinator", reportsTo: "Melissa Jaggard" },
    ],
  },
  {
    name: "Risk, Legal, & Compliance",
    people: [
      { name: "Jadine Reddy", title: "Senior Compliance Advisor", reportsTo: "Nithin Parmanand" },
      { name: "Nithin Parmanand", title: "Director of Legal & Compliance", reportsTo: "Steven Spartinos" },
    ],
  },
  {
    name: "Finance",
    people: [
      { name: "Kelsi Hart", title: "Senior Financial Accountant", reportsTo: "Tarryn Bales" },
      { name: "Lino Cuamba", title: "Junior Accountant", reportsTo: "Tarryn Bales" },
      { name: "Neli Nkosi", title: "Financial Accountant", reportsTo: "Tarryn Bales" },
      { name: "Tarryn Bales", title: "Group Financial Manager", reportsTo: "Paul Shackleton" },
    ],
  },
  {
    name: "Operations",
    people: [
      { name: "Justin Frost", title: "Director of Operations", reportsTo: "Jason Pretorius" },
    ],
  },
  {
    name: "Shared Services",
    people: [
      { name: "Florence Ncube", title: "Office Cleaner", reportsTo: "Mandy Gallagher" },
      { name: "Mandy Gallagher", title: "Executive PA / Office Manager", reportsTo: "Steven Spartinos" },
    ],
  },
  {
    name: "Executive",
    people: [
      { name: "Jason Pretorius", title: "Co-Chief Executive Officer" },
      { name: "Paul Shackleton", title: "CFO", reportsTo: "Steven Spartinos" },
      { name: "Steven Spartinos", title: "Co-Chief Executive Officer" },
    ],
  },
  {
    name: "PMO",
    people: [
      { name: "Melissa Gillot", title: "Project Coordinator", reportsTo: "Viren Ramsunder" },
      { name: "Thereshen Naidoo", title: "Technical Project Manager", reportsTo: "Viren Ramsunder" },
      { name: "Viren Ramsunder", title: "Project Manager", reportsTo: "Justin Frost" },
    ],
  },
];
