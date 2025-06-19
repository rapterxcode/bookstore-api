const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ path: './config.env' });

const app = express();
const PORT = process.env.PORT || 3000;

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

if (!dbConfig.host || !dbConfig.user || !dbConfig.password || !dbConfig.database) {
  console.error('Missing required database configuration in config.env');
  console.error('Required: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
  process.exit(1);
}

const conndb = mysql.createPool(dbConfig);

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function insertNewBook(bookData) {
  return conndb.getConnection().then(conn => {
    const { title, author, published_year, genre } = bookData;
    const query = `
      INSERT INTO books (title, author, published_year, genre)
      VALUES (?, ?, ?, ?)
    `;
    return conn.query(query, [title, author, published_year, genre])
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

function fetchAllBooks() {
  return conndb.getConnection().then(conn => {
    const query = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      ORDER BY created_at DESC
    `;
    return conn.query(query)
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

function fetchBookById(id) {
  return conndb.getConnection().then(conn => {
    const query = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE id = ?
    `;
    return conn.query(query, [id])
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

function modifyBookById(id, bookData) {
  return conndb.getConnection().then(conn => {
    const { title, author, published_year, genre } = bookData;
    const query = `
      UPDATE books 
      SET title = ?, author = ?, published_year = ?, genre = ?
      WHERE id = ?
    `;
    return conn.query(query, [title, author, published_year, genre, id])
      .then(result => {
        if (result.affectedRows === 0) {
          conn.release();
          return {
            success: false,
            message: 'Book not found',
            data: null
          };
        }
        return fetchBookById(id).then(response => {
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

function removeBookById(id) {
  return conndb.getConnection().then(conn => {
    return fetchBookById(id)
      .then(response => {
        if (!response.success) {
          conn.release();
          return response;
        }
        const query = `DELETE FROM books WHERE id = ?`;
        return conn.query(query, [id])
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

function findBooksByKeyword(searchTerm) {
  return conndb.getConnection().then(conn => {
    const query = `
      SELECT id, title, author, published_year, genre, 
             created_at, updated_at
      FROM books 
      WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?
      ORDER BY created_at DESC
    `;
    const searchPattern = `%${searchTerm}%`;
    return conn.query(query, [searchPattern, searchPattern, searchPattern])
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

app.post('/api/books', (req, res) => {
  const { title, author, published_year, genre } = req.body;
  if (!title || !author) {
    return res.status(400).json({ error: 'Title and author required' });
  }
  
  conndb.query('INSERT INTO books (title, author, published_year, genre) VALUES (?, ?, ?, ?)', 
    [title, author, published_year, genre])
    .then(result => {
      res.json({ id: result[0].insertId, title, author, published_year, genre });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

app.get('/api/books', (req, res) => {
  conndb.query('SELECT * FROM books ORDER BY created_at DESC')
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
  
  conndb.query('SELECT * FROM books WHERE title LIKE ? OR author LIKE ? OR genre LIKE ?', 
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
  conndb.query('SELECT * FROM books WHERE id = ?', [id])
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
  
  conndb.query('UPDATE books SET title = ?, author = ?, published_year = ?, genre = ? WHERE id = ?', 
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
  conndb.query('DELETE FROM books WHERE id = ?', [id])
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
    message: 'Book API is running',
    version: '1.0.0',
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

  let error = { ...err };
  error.message = err.message;

  console.error(err.stack);

  if (err.code === 'ER_DUP_ENTRY') {
    const message = 'Duplicate field value entered';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    const message = 'Referenced record not found';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'ER_BAD_FIELD_ERROR') {
    const message = 'Invalid field name';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'ER_ACCESS_DENIED_ERROR') {
    const message = 'Database access denied. Check your credentials.';
    error = { message, statusCode: 500 };
  }

  if (err.code === 'ECONNREFUSED') {
    const message = 'Database connection refused. Check if MySQL is running.';
    error = { message, statusCode: 500 };
  }

  if (err.code === 'ER_BAD_DB_ERROR') {
    const message = 'Database does not exist.';
    error = { message, statusCode: 500 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
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

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
}); 