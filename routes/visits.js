const visit = require("../controllers/visit");
const express = require("express");
const router = express.Router();
const handler = require("../utils/ControllerHandler");
const auth = require("../auth");
router.use(auth.jwt());

/**
 * @swagger
 * /visits:
 *   post:
 *     description: Crear una Visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: visit
 *         description: Visita
 *         in:  body
 *         schema:
 *           $ref: '#/definitions/Visit'
 *     responses:
 *       200:
 *         description: Visita Creada
 *         schema:
 *             $ref: '#/definitions/Visit'
 */
router.post(
  "/",
  handler(visit.create, (req, res, next) => [
    { resident: req.user.id, ...req.body }
  ])
);

/**
 * @swagger
 * /visits/{visit}:
 *   put:
 *     description: Modificar una Visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: body
 *         description: Visita
 *         in:  body
 *         schema:
 *           $ref: '#/definitions/Visit'
 *       - name: visit
 *         in:  path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visita Creada
 *         schema:
 *             $ref: '#/definitions/Visit'
 */
router.put(
  "/:visit",
  handler(visit.update, (req, res, next) => [
    req.params.visit,
    req.body,
    req.user
  ])
);

/**
 * @swagger
 * /visits/{visit}:
 *   get:
 *     description: Detalles de la visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: body
 *         description: Visita
 *         in:  body
 *         schema:
 *           $ref: '#/definitions/Visit'
 *       - name: visit
 *         in:  path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visita Creada
 *         schema:
 *             $ref: '#/definitions/Visit'
 */
router.get(
  "/:visit",
  handler(visit.detail, (req, res, next) => [req.params.visit, req.user])
);

/**
 * @swagger
 * /visits/{visit}/giveAccess:
 *   put:
 *     description: Dar Acceso a un Visitante
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:

 *     responses:
 *       200:
 *         description: Visita Creada
 *         schema:
 *             $ref: '#/definitions/Visit'
 */
router.put(
  "/:visit/giveAccess",
  handler(visit.giveAccess, (req, res, next) => [
    req.params.visit,
    req.query.access,
    req.user
  ])
);

/**
 * @swagger
 * /visits/{visit}:
 *   delete:
 *     description: Eliminar una Visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: visit
 *         in:  path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visita Eliminada
 */
router.delete(
  "/:visit",
  handler(visit.destroy, (req, res, next) => [req.params.visit, req.user])
);

/**
 * @swagger
 * /visits/{visit}/checkIn:
 *   post:
 *     description: Marcar Entrada de una visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: visit
 *         in:  path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visita Eliminada
 */
router.post(
  "/:visit/checkIn",
  handler(visit.check, (req, res, next) => [req.params.visit, "IN", req.user])
);

router.post(
  "/:visit/addPhotos",
  handler(visit.addPhotos, (req, res, next) => [req.params.visit, req.files, req.user])
);

/**
 * @swagger
 * /visits/{visit}/checkOut:
 *   post:
 *     description: Marcar Salida de una visita
 *     tags:
 *      - Visit
 *     produces:
 *      - application/json
 *     parameters:
 *       - name: visit
 *         in:  path
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Visita Eliminada
 */
router.post(
  "/:visit/checkOut",
  handler(visit.check, (req, res, next) => [req.params.visit, "OUT", req.user])
);

module.exports = router;
