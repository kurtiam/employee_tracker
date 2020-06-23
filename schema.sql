DROP DATABASE etracker_db;
CREATE DATABASE etracker_db;
USE etracker_db;



CREATE TABLE department
(
  id int
  AUTO_INCREMENT,
  name varchar
  (30) NOT NULL,
  PRIMARY KEY
  (id)
);

  CREATE TABLE role
  (
    id int
    AUTO_INCREMENT,
  title varchar
    (30) NOT NULL,
  salary decimal
    (9.2) NOT NULL,
  dept_id int NOT NULL,
  PRIMARY KEY
    (id),
  FOREIGN KEY
    (dept_id) 
  REFERENCES department
    (id)
  ON
    DELETE CASCADE
);

    CREATE TABLE employee
    (
      id int
      AUTO_INCREMENT,
  first_name varchar
      (30) NOT NULL,
  last_name varchar
      (30) NOT NULL,
  role_id int NOT NULL,
  manager_id int,
  PRIMARY KEY
      (id),
  CONSTRAINT fk_role_id
  FOREIGN KEY
      (role_id) 
  REFERENCES role
      (id)
  ON
      DELETE CASCADE
);


      -- seed sample data stuff 
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Director", 100000, 5);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Janitor", 50000, 1);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Engineer", 85000, 1);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("System Admin", 60000, 3);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Office Manager", 50000, 5);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Cleaner", 30000, 2);
      INSERT INTO role
        (title, salary, dept_id)
      VALUES
        ("Assistant", 35000, 4);

      INSERT INTO employee
        (first_name,last_name,role_id,manager_id)
      VALUES
        ("Joan", "Patrick", 3, 1),
        ("Florence", "Alexander", 3, 1),
        ("Zoe", "Snider", 3, 1),
        ("Curran", "Butler", 3, 2),
        ("Nita", "Barton", 3, 3),
        ("Felicia", "Bentley", 2, 1),
        ("Cody", "Potter", 3, 3),
        ("Martha", "Foster", 3, 2),
        ("Arthur", "Pate", 1, 2),
        ("Amal", "Daugherty", 2, 2);
      INSERT INTO department
        (name)
      VALUES
        ("Support"),
        ("Sanitation"),
        ("IT"),
        ("HR"),
        ("OPs");

