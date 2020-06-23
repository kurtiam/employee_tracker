var mysql = require("mysql");
const inquirer = require('inquirer');
const chalk = require('chalk');
const cTable = require('console.table');
const logo = require('asciiart-logo');
const config = require('./package.json');
console.log(logo(config).render());


var connection = mysql.createConnection({
    host: "localhost",

    // Your port; if not 3306
    port: 3306,

    // Your username
    user: "root",

    // Your password
    password: "password",

    // Database name
    database: "etracker_db",
    multipleStatements: true
});

connection.connect(function (err) {
    if (err) throw err;
    // run the start f
    start();
});

const welcomeScreen = ['View all Employees', 'View all Emplyees by Department', 'Add Employee', 'Remove Employee', 'Update Employee Role', 'View All Roles', 'Add Role', 'Remove Role', 'View Current Departments', 'Add Department', 'Remove Department', 'Exit']

function start() {
    inquirer
        .prompt({
            name: "welcome",
            type: "list",
            message: "Would you like to do?",
            pageSize: 15,
            choices: welcomeScreen

        }).then((answer) => {
            switch (answer.welcome) {
                case 'View all Employees':
                    viewAll();
                    break;
                case 'View all Emplyees by Department':
                    viewByDept();
                    break;
                case 'Add Employee':
                    addEmployee();
                    break;
                case 'Remove Employee':
                    deleteEmployee();
                    break;
                case 'Update Employee Role':
                    updateRole();
                    break;
                case 'View All Roles':
                    viewRole();
                    break;
                case 'Add Role':
                    addRole();
                    break;
                case 'Remove Role':
                    deleteRole();
                    break;
                case 'View Current Departments':
                    viewAllDept();
                    break;
                case 'Add Department':
                    addDept();
                    break;
                case 'Remove Department':
                    deleteDept();
                    break;
                case 'Exit':
                    connection.end();
                    break;
            };
        });

};

const allEmployees = `SELECT employee.id As "ID #", 
employee.first_name AS "First Name",
employee.last_name AS "Last Name",
role.title As "Title",
department.name AS "Department",
role.salary AS "Salary",
CONCAT(Manager.first_name, ' ', Manager.last_name) AS Manager
FROM  employee
JOIN employee Manager on manager.id = employee.manager_id
LEFT JOIN role ON role.id = employee.role_id 
LEFT JOIN department ON department.id = role.id
ORDER BY employee.id;
`
const roleQuery = `SELECT * from role; 
SELECT CONCAT (employee.first_name," ",employee.last_name) AS full_name, role.title, department.name 
FROM employee 
INNER JOIN role ON role.id = employee.role_id 
INNER JOIN department ON department.id = role.dept_id`

const addEmployeeInfo = ['Employee first name?', 'Employee last name?', 'Employee role?']

const viewAll = () => {

    connection.query(allEmployees, (err, results) => {
        if (err) throw err;
        console.log(' ');
        console.table(chalk.yellow('All Employees'), results)
        start();
    });

};

const viewByDept = () => {
    const deptQuery = 'SELECT * FROM department';
    connection.query(deptQuery, (err, results) => {
        if (err) throw err;

        inquirer.prompt([
            {
                name: 'deptChoice',
                type: 'list',
                choices: function () {
                    let choiceArray = results.map(choice => choice.name)
                    return choiceArray;
                },
                message: 'Select a Department to view:'
            }
        ]).then((answer) => {
            let chosenDept;
            for (let i = 0; i < results.length; i++) {
                if (results[i].name === answer.deptChoice) {
                    chosenDept = results[i];
                }
            };

            //const byDeptQuery = 'SELECT employee.id As "ID #", employee.first_name AS "First Name", employee.last_name AS "Last Name", role.title AS "Title", department.name AS "Department", role.salary AS "Salary" FROM employee INNER JOIN role role ON role.id = employee.role_id INNER JOIN department ON department.id = role.id WHERE ?;';

            const byDeptQuery = `SELECT employee.id As "ID #", 
            employee.first_name AS "First Name",
            employee.last_name AS "Last Name",
            role.title As "Title",
            department.name AS "Department",
            role.salary AS "Salary",
            employee.manager_id AS "Manager"
            FROM  employee
            INNER JOIN role ON role.id = employee.role_id 
            INNER JOIN department ON department.id = role.id
            WHERE ?;
            `
            connection.query(byDeptQuery, { name: chosenDept.name }, (err, res) => {
                if (err) throw err;
                console.log('');
                console.table(chalk.yellow(`All Employees by Department: `) + (chalk.blue(`${chosenDept.name}`)), res)
                start();
            });
        });
    });
};

const addEmployee = () => {
    connection.query(roleQuery, (err, results) => {
        if (err) throw err;

        inquirer.prompt([
            {
                name: 'firstName',
                type: 'input',
                message: addEmployeeInfo[0]

            },
            {
                name: 'lastName',
                type: 'input',
                message: addEmployeeInfo[1]
            },
            {
                name: 'role',
                type: 'list',
                choices: function () {
                    let choiceList = results[0].map(choice => choice.title);
                    return choiceList;
                },
                message: addEmployeeInfo[2]

            },

            {
                name: 'manager',
                type: 'list',
                choices: function () {
                    let choiceList = results[1].map(choice => choice.full_name);
                    return choiceList;
                },
                message: addEmployeeInfo[3]

            }
        ]).then((answer) => {
            connection.query(
                `INSERT INTO employee(first_name, last_name, role_id, manager_id)
                 VALUES(?, ?, 
                 (SELECT id FROM role WHERE title = ? ), 
                 (SELECT id FROM (SELECT id FROM employee WHERE CONCAT(first_name," ",last_name) = ? ) AS temptable))`, [answer.firstName, answer.lastName, answer.role, answer.manager]
            )
            start();
        });
    });
};

const deleteEmployee = () => {
    connection.query(allEmployees, (err, results) => {
        if (err) throw err;
        console.log(' ');
        console.table(chalk.yellow('All Employees'), results)
        inquirer.prompt([
            {
                name: 'removeByID',
                type: 'input',
                message: 'Enter the Employee ID of the person to remove:'
            }
        ]).then((answer) => {
            connection.query(`DELETE FROM employee where ?`, { id: answer.removeByID })
            console.log(chalk.green("Success! Employee ID# " + chalk.red(answer.removeByID) + " has been removed"))
            start();
        });
    });
};

const updateRole = () => {

    const updateRoleQuery = 'SELECT CONCAT (first_name," ",last_name) AS full_name FROM employee; SELECT title FROM role;'
    connection.query(updateRoleQuery, (err, results) => {
        if (err) throw err;


        inquirer.prompt([
            {
                name: 'workers',
                type: 'list',
                choices: function () {
                    let choiceList = results[0].map(choice => choice.full_name);
                    return choiceList;
                },
                message: 'Select an employee to update their role:'
            },

            {
                name: 'newRole',
                type: 'list',
                choices: function () {
                    let choiceList = results[1].map(choice => choice.title);
                    return choiceList;
                }
            }
        ]).then((answer) => {
            connection.query(`UPDATE employee
            SET role_id =  (SELECT id FROM role WHERE title = ? ) 
            WHERE id = (SELECT id FROM(SELECT id FROM employee WHERE CONCAT(first_name," ",last_name) = ?) AS tmptable)`, [answer.newRole, answer.workers], (err, results) => {
                if (err) throw err;
                start();
            });
        });


    });
};

const viewRole = () => {
    let query = `SELECT title AS "Title" FROM role`;
    connection.query(query, (err, results) => {
        if (err) throw err;

        console.log('');
        console.table(chalk.yellow('Current Roles'), results);
        start();
    });
};


const addRole = () => {
    const addRoleQuery = `SELECT department.name AS "Department" FROM role  INNER JOIN department ON department.id = role.id`
    connection.query(addRoleQuery, (err, results) => {
        if (err) throw err;

        console.log('');
        console.table(chalk.yellow('List of current Roles:'), results.title);

        inquirer.prompt([
            {
                name: 'newTitle',
                type: 'input',
                message: 'Enter the new Title:'
            },
            {
                name: 'newSalary',
                type: 'input',
                message: 'Enter the salary for the new Title:'
            },
            {
                name: 'dept',
                type: 'list',
                choices: function () {
                    let choiceList = results.map(choice => choice.Department);
                    return choiceList;
                },
                message: 'Select the Department for this new Title:'
            }
        ]).then((answer) => {
            connection.query(
                `INSERT INTO role(title, salary, dept_id) 
                VALUES
                ("${answer.newTitle}", "${answer.newSalary}", 
                (SELECT id FROM department WHERE name = "${answer.dept}"));`

            )
            console.log(chalk.green("Success! New Role: " + chalk.red(answer.newTitle) + " has been added"))
            start();

        });
    });

};

deleteRole = () => {
    const deleteRolequery = `SELECT * FROM role`;
    connection.query(deleteRolequery, (err, results) => {
        if (err) throw err;

        inquirer.prompt([
            {
                name: 'deleteRole',
                type: 'list',
                choices: function () {
                    let choiceList = results.map(choice => choice.title);
                    return choiceList;
                },
                message: 'Select a Role to remove:'
            }
        ]).then((answer) => {
            connection.query(`DELETE FROM role WHERE ? `, { title: answer.deleteRole });
            console.log(chalk.green("Success! The " + chalk.red(answer.deleteRole) + " Role has been removed"))
            start();

        });

    });

};

const viewAllDept = () => {
    query = `SELECT name "Current Depatmants" FROM department`;
    connection.query(query, (err, results) => {
        if (err) throw err;

        console.log('');
        console.table(chalk.yellow('Departments'), results)
        start();
    });
};

const addDept = () => {
    addDeptQuery = `SELECT name AS "Departments" FROM department`;
    connection.query(addDeptQuery, (err, results) => {
        if (err) throw err;

        console.log('');
        console.table(chalk.yellow('List of current Departments'), results);

        inquirer.prompt([
            {
                name: 'newDept',
                type: 'input',
                message: 'Enter the name of the Department to add:'
            }
        ]).then((answer) => {
            connection.query(`INSERT INTO department(name) VALUES( ? )`, answer.newDept)
            console.log(chalk.green("Success! The " + chalk.red(answer.newDept) + " Department has been Added"))

            start();
        });
    });
};

const deleteDept = () => {
    deleteDeptQuery = `SELECT * FROM department`;
    connection.query(deleteDeptQuery, (err, results) => {
        if (err) throw err;

        inquirer.prompt([
            {
                name: 'dept',
                type: 'list',
                choices: function () {
                    let choiceList = results.map(choice => choice.name);
                    return choiceList;
                },
                message: 'Select the department to remove:'
            }
        ]).then((answer) => {
            connection.query(`DELETE FROM department WHERE ? `, { name: answer.dept })
            console.log(chalk.green("Success! The " + chalk.red(answer.dept) + " Department has been removed"))
            start();
        });
    });
};

