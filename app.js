const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: './config.env' });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database configuration - my custom setup
const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Validate database config - my validation approach
if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
  console.error('Missing required database configuration in config.env');
  console.error('Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
  process.exit(1);
}

// Create database connection pool - my preferred method
const dbPool = mysql.createPool(dbConfig);

// Middleware setup - my security and logging preferences
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// My custom function to add new books
function addNewBook(bookData) {
  return dbPool.getConnection().then(conn => {
    const { title, author, published_year, genre } = bookData;
    const insertQuery = `
      INSERT INTO books (title, author, published_year, genre)
      VALUES (?, ?, ?, ?)
    `;
    return conn.query(insertQuery, [title, author, published_year, genre])
      .then(result => {
        conn.release();
        return {
          success: true,
          message: 'Book created successfully',
          data: {
            id: result.insertId,
            ...bookData,
            created_at: new Date(),
            updated_at: new Date()
          }
        };
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error creating book',
          error: err.message
        };
      });
  });
}

// My function to get all books with custom ordering
function getAllBooks() {
  return dbPool.getConnection().then(conn => {
    const selectQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      ORDER BY created_at DESC
    `;
    return conn.query(selectQuery)
      .then(books => {
        conn.release();
        return {
          success: true,
          message: 'Books retrieved successfully',
          count: books.length,
          data: books
        };
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error fetching books',
          error: err.message
        };
      });
  });
}

// My function to get book by ID
function getBookById(id) {
  return dbPool.getConnection().then(conn => {
    const selectQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE id = ?
    `;
    return conn.query(selectQuery, [id])
      .then(books => {
        conn.release();
        if (books.length === 0) {
          return {
            success: false,
            message: 'Book not found',
            data: null
          };
        }
        return {
          success: true,
          message: 'Book retrieved successfully',
          data: books[0]
        };
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error fetching book',
          error: err.message
        };
      });
  });
}

// My function to update book details
function updateBookById(id, bookData) {
  return dbPool.getConnection().then(conn => {
    const { title, author, published_year, genre } = bookData;
    const updateQuery = `
      UPDATE books 
      SET title = ?, author = ?, published_year = ?, genre = ?
      WHERE id = ?
    `;
    return conn.query(updateQuery, [title, author, published_year, genre, id])
      .then(result => {
        if (result.affectedRows === 0) {
          conn.release();
          return {
            success: false,
            message: 'Book not found',
            data: null
          };
        }
        return getBookById(id).then(response => {
          conn.release();
          return response;
        });
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error updating book',
          error: err.message
        };
      });
  });
}

// My function to delete book
function deleteBookById(id) {
  return dbPool.getConnection().then(conn => {
    return getBookById(id)
      .then(response => {
        if (!response.success) {
          conn.release();
          return response;
        }
        const deleteQuery = `DELETE FROM books WHERE id = ?`;
        return conn.query(deleteQuery, [id])
          .then(() => {
            conn.release();
            return {
              success: true,
              message: 'Book deleted successfully',
              data: response.data
            };
          });
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error deleting book',
          error: err.message
        };
      });
  });
}

// My custom search function
function searchBooksByKeyword(searchTerm) {
  return dbPool.getConnection().then(conn => {
    const searchQuery = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${searchTerm}%`;
    return conn.query(searchQuery, [searchPattern, searchPattern, searchPattern])
      .then(books => {
        conn.release();
        return {
          success: true,
          message: 'Search completed successfully',
          count: books.length,
          searchTerm: searchTerm,
          data: books
        };
      })
      .catch(err => {
        conn.release();
        return {
          success: false,
          message: 'Error searching books',
          error: err.message
        };
      });
  });
}

// My API routes - simplified and clean approach
app.post('/api/books', (req, res) => {
  const { title, author, published_year, genre } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'Title and author required' });
  }
  
  dbPool.query('INSERT INTO books (title, author, published_year, genre) VALUES (?, ?, ?, ?)', 
    [title, author, published_year, genre])
    .then(result => {
      res.json({ id: result[0].insertId, title, author, published_year, genre });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/api/books', (req, res) => {
  dbPool.query('SELECT * FROM books ORDER BY created_at DESC')
    .then(result => {
      res.json(result[0]);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/api/books/search', (req, res) => {
  const q = req.query.q;
  if (!q) {
    return res.status(400).json({ error: 'Search term required' });
  }
  
  dbPool.query('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?', 
    [`%${q}%`, `%${q}%`, `%${q}%`])
    .then(result => {
      res.json(result[0]);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/api/books/:id', (req, res) => {
  const id = req.params.id;
  dbPool.query('SELECT * FROM books WHERE id = ?', [id])
    .then(result => {
      if (result[0].length === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      res.json(result[0][0]);
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.put('/api/books/:id', (req, res) => {
  const id = req.params.id;
  const { title, author, published_year, genre } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'Title and author required' });
  }
  
  dbPool.query('UPDATE books SET title = ?, author = ?, published_year = ?, genre = ? WHERE id = ?', 
    [title, author, published_year, genre, id])
    .then(result => {
      if (result[0].affectedRows === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      res.json({ id, title, author, published_year, genre });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.delete('/api/books/:id', (req, res) => {
  const id = req.params.id;
  dbPool.query('DELETE FROM books WHERE id = ?', [id])
    .then(result => {
      if (result[0].affectedRows === 0) {
        return res.status(404).json({ error: 'Book not found' });
      }
      res.json({ message: 'Book deleted' });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Book API is running smoothly',
    version: '1.0.0',
    developer: 'Phone',
    github: 'https://github.com/rapterxcode/bookstore-api',
    endpoints: {
      books: {
        getAll: 'GET /api/books',
        getById: 'GET /api/books/:id',
        create: 'POST /api/books',
        update: 'PUT /api/books/:id',
        delete: 'DELETE /api/books/:id',
        search: 'GET /api/books/search?q=search_term'
      }
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`================================================================================`);
  console.log(`Developed by Phone : https://github.com/rapterxcode/bookstore-api`);
  console.log(`================================================================================`);

  console.log(`Server running on port ${PORT}`);
  console.log(`Book API is ready at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
  console.log(`================================================================================`);
});
